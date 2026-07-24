# Patient registration
# Hospital registration
# Ambulance service registration
# Login (all roles) with role-based response
# Password reset request + confirm
# Role enforced permanently at registration
# Institutional accounts start pending
# Account locked after 5 failed login attempts

from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import GenericViewSet
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.permissions import IsAmbulanceService
from .models import InstitutionalStatus, User
from .serializers import (
    AmbulanceRegistrationSerializer,
    AvailabilityToggleSerializer,
    HospitalRegistrationSerializer,
    InstitutionalDocumentSerializer,
    PatientRegistrationSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    UserSummarySerializer,
)


def _token_response(user: User) -> dict:
    # Generate JWT token pair plus user summary for login responses.
    refresh = RefreshToken.for_user(user)
    return {
        "refresh": str(refresh),
        "access": str(refresh.access_token),
        "user": UserSummarySerializer(user).data,
    }

# Patient Registration

class PatientRegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PatientRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {
                "message": "Registration successful. Please complete your medical intake form.",
                **_token_response(user),
            },
            status=status.HTTP_201_CREATED,
        )

# Hospital Registration

class HospitalRegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = HospitalRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {
                "message": "Hospital registration successful.",
                **_token_response(user),
            },
            status=status.HTTP_201_CREATED,
        )

# Ambulance Service Registration

class AmbulanceRegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = AmbulanceRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {
                "message": "Ambulance service registration successful.",
                **_token_response(user),
            },
            status=status.HTTP_201_CREATED,
        )

# Step 3 — Document Upload (authenticated, pre-approval)

class InstitutionalDocumentUploadView(APIView):
    # Hospitals and Ambulance Services upload supporting documents
    # after initial registration but before admin approval.
    # Authentication uses the JWT issued at registration.

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if request.user.role not in ("hospital", "ambulance_service"):
            return Response(
                {"detail": "Only institutional accounts can upload documents."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = InstitutionalDocumentSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def get(self, request):
        """List own uploaded documents."""
        docs = request.user.institutional_documents.all()
        serializer = InstitutionalDocumentSerializer(docs, many=True)
        return Response(serializer.data)

# Login (all roles)

class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        password = request.data.get("password", "")

        if not email or not password:
            return Response(
                {"detail": "Email and password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            # Generic message to prevent user enumeration
            return Response(
                {"detail": "Invalid credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Check for account lock before attempting password check
        if user.is_locked:
            return Response(
                {"detail": "Account locked due to too many failed login attempts. Please reset your password or contact support."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not user.check_password(password):
            user.record_failed_login()
            remaining = max(0, 5 - user.failed_login_attempts)
            return Response(
                {
                    "detail": "Invalid credentials.",
                    "attempts_remaining": remaining,
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # PROTOTYPE: approval gate bypassed; reinstate for production
        # if user.role in ("hospital", "ambulance_service"):
        #     if user.institutional_status == InstitutionalStatus.PENDING:
        #         return Response(
        #             {"detail": "Your account is pending MERA admin approval. You will be notified by email."},
        #             status=status.HTTP_403_FORBIDDEN,
        #         )
        #     if user.institutional_status == InstitutionalStatus.REJECTED:
        #         return Response(
        #             {
        #                 "detail": "Your account registration was not approved.",
        #                 "reason": user.institutional_rejection_reason,
        #             },
        #             status=status.HTTP_403_FORBIDDEN,
        #         )

        user.reset_login_attempts()
        return Response(_token_response(user), status=status.HTTP_200_OK)

# Password Reset

class PasswordResetRequestView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        # Always return 200 regardless of whether email exists (anti-enumeration)
        return Response(
            {"detail": "If an account with that email exists, a reset link has been sent."},
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {"detail": "Password reset successful. You can now log in with your new password."},
            status=status.HTTP_200_OK,
        )

# Authenticated user — profile + availability toggle

class MeView(APIView):
    # GET /auth/me/ — returns the authenticated user's summary.
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSummarySerializer(request.user).data)


class AvailabilityToggleView(APIView):
    # PATCH /auth/me/availability/
    # Ambulance dispatcher sets themselves Busy / Available.

    permission_classes = [permissions.IsAuthenticated, IsAmbulanceService]

    def patch(self, request):
        serializer = AvailabilityToggleSerializer(
            request.user, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSummarySerializer(request.user).data)

# MERA Admin: approve / reject institutional accounts

class InstitutionalApprovalView(APIView):
    # POST /auth/admin/approve/{user_id}/
    # POST /auth/admin/reject/{user_id}/
    # Only accessible by MERA staff (is_staff=True).

    permission_classes = [permissions.IsAdminUser]

    def post(self, request, user_id, decision):
        try:
            user = User.objects.get(
                id=user_id,
                role__in=["hospital", "ambulance_service"],
            )
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        from django.utils import timezone

        if decision == "approve":
            user.institutional_status = InstitutionalStatus.APPROVED
            user.is_active = True
            user.institutional_status_updated_at = timezone.now()
            user.institutional_rejection_reason = ""
            user.save(update_fields=[
                "institutional_status", "is_active",
                "institutional_status_updated_at", "institutional_rejection_reason",
            ])
            # TODO: send approval email
            return Response({"detail": f"{user.get_display_name()} approved."})

        elif decision == "reject":
            reason = request.data.get("reason", "")
            user.institutional_status = InstitutionalStatus.REJECTED
            user.institutional_rejection_reason = reason
            user.institutional_status_updated_at = timezone.now()
            user.save(update_fields=[
                "institutional_status", "institutional_rejection_reason",
                "institutional_status_updated_at",
            ])
            # TODO: send rejection email
            return Response({"detail": f"{user.get_display_name()} rejected."})

        return Response({"detail": "Invalid decision."}, status=status.HTTP_400_BAD_REQUEST)

        # Hospital List — for patient hospital selection screen

class HospitalListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        hospitals = User.objects.filter(
            role='hospital',
            is_active=True,
            institutional_status=InstitutionalStatus.APPROVED,
        ).values('id', 'facility_name', 'facility_type', 'official_address', 'province')
        return Response(list(hospitals))