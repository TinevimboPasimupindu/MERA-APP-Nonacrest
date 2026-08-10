# Patient registration
# Hospital registration
# Ambulance service registration
# Login (all roles) with role-based response
# Password reset request + confirm
# Role enforced permanently at registration
# Institutional accounts start pending
# Account locked after 5 failed login attempts
# Email OTP second factor after password (patients only)

import logging
import secrets
from datetime import timedelta

import requests
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import GenericViewSet
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.permissions import IsAmbulanceService, IsMERAAdmin
from emergencies.models import Incident
from .models import AMBULANCE_ROLES, EmailOTP, HOSPITAL_ROLES, InstitutionalStatus, Role, User
from .serializers import (
    AdminUserEditSerializer,
    AdminUserListSerializer,
    AmbulanceAdminCreationSerializer,
    AmbulanceRegistrationSerializer,
    AvailabilityToggleSerializer,
    EMTCreationSerializer,
    EMTUpdateSerializer,
    GoogleSignInSerializer,
    HospitalAdminCreationSerializer,
    HospitalRegistrationSerializer,
    InstitutionalDocumentSerializer,
    InstitutionSummarySerializer,
    PatientRegistrationSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    UserSummarySerializer,
    VerifyOTPSerializer,
)

logger = logging.getLogger(__name__)

# OTP validity window and how often a user may have a new one generated
# (via login or resend) — see _generate_and_send_otp's own comment and
# PROJECT_CONTEXT.md for the full rate-limiting reasoning.
OTP_VALIDITY_MINUTES = 5
OTP_MAX_PER_WINDOW = 3
OTP_GENERATION_WINDOW_MINUTES = 10

BREVO_SEND_EMAIL_URL = "https://api.brevo.com/v3/smtp/email"
# Real quota per call, real user waiting on the other end of this request —
# short and deliberate, not left to whatever requests'/the OS's default
# would be. This is the exact gap that caused the earlier production
# incident: Gmail SMTP had no timeout configured at all, so a blocked
# connection attempt (Render blocks outbound SMTP ports platform-wide —
# see settings.py) hung until gunicorn's own --timeout force-killed the
# stuck worker. A plain HTTP POST with an explicit timeout can only ever
# fail fast, never hang the request.
BREVO_TIMEOUT_SECONDS = 10.0


class OTPDeliveryError(Exception):
    """Raised when an OTP code was generated but could not be emailed."""


def _send_otp_email(user: User, code: str) -> None:
    # Brevo's transactional email HTTP API (plain HTTPS, port 443 — not
    # blocked on Render's free tier the way SMTP ports are). Uses `requests`
    # directly rather than Brevo's own SDK — `requests` is already an
    # installed dependency (google-auth's transport pulls it in, see
    # accounts/serializers.py), so this adds zero new packages, which
    # mattered given the same day's memory investigation into this app's
    # per-worker footprint.
    try:
        response = requests.post(
            BREVO_SEND_EMAIL_URL,
            headers={
                "api-key": settings.BREVO_API_KEY,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            json={
                "sender": {"email": settings.BREVO_SENDER_EMAIL},
                "to": [{"email": user.email}],
                "subject": "Your MERA verification code",
                "textContent": (
                    f"Your MERA login verification code is {code}.\n\n"
                    f"This code expires in {OTP_VALIDITY_MINUTES} minutes. "
                    "If you didn't try to log in, you can ignore this email."
                ),
            },
            timeout=BREVO_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        # Covers a timeout, a connection failure, and a non-2xx response
        # (raise_for_status()) uniformly — any of these means "the code
        # was not delivered," which every caller needs to treat the same
        # way: tell the user clearly, don't pretend success, don't hang.
        logger.warning("Brevo OTP email send failed for user %s: %r", user.id, exc)
        raise OTPDeliveryError("Could not send verification code.") from exc


def _search_filter(queryset, search: str):
    # Shared by InstitutionsListView/AllUsersListView for ?search=. Case-
    # insensitive partial match against every "name" field that could be
    # populated depending on role (full_name for patient/EMT, facility_name
    # for hospital roles, service_name for ambulance roles) OR'd with email.
    # Safe to apply the full field set regardless of which view calls this —
    # a role's irrelevant name field is just blank and never matches, so
    # there's no need to branch per role here.
    search = search.strip()
    if not search:
        return queryset
    return queryset.filter(
        Q(full_name__icontains=search)
        | Q(facility_name__icontains=search)
        | Q(service_name__icontains=search)
        | Q(email__icontains=search)
    )


def _token_response(user: User) -> dict:
    # Generate JWT token pair plus user summary for login responses.
    refresh = RefreshToken.for_user(user)
    return {
        "refresh": str(refresh),
        "access": str(refresh.access_token),
        "user": UserSummarySerializer(user).data,
    }


def _generate_and_send_otp(user: User) -> bool:
    # Shared by LoginView (post-password) and ResendOTPView, so the
    # generation rate limit applies identically regardless of which one
    # triggered it — a resend-only limit would be trivially bypassed by
    # just logging in again with the correct password.
    #
    # Rate-limiting reasoning (two distinct concerns, not one):
    #   - THIS function throttles *generation*: at most OTP_MAX_PER_WINDOW
    #     new codes per user per OTP_GENERATION_WINDOW_MINUTES. Generating
    #     a code sends a real email, so an unthrottled caller could spam a
    #     target's inbox, or burn through this app's Brevo sending quota,
    #     just by hitting login (or resend) repeatedly with a correct
    #     password. 3 per 10 minutes is deliberately generous for the
    #     legitimate case (typo'd the code, let it expire, resent once or
    #     twice) while still bounding the total volume to a handful, not
    #     unlimited.
    #   - The SEPARATE concern — brute-forcing a live code's 6-digit space
    #     — is throttled elsewhere, per-code, via EmailOTP.attempts /
    #     OTP_MAX_VERIFY_ATTEMPTS in VerifyOTPSerializer. That's a guess
    #     limit, not a generation limit; the two don't substitute for each
    #     other, which is why both exist.
    window_start = timezone.now() - timedelta(minutes=OTP_GENERATION_WINDOW_MINUTES)
    recent_count = EmailOTP.objects.filter(user=user, created_at__gte=window_start).count()
    if recent_count >= OTP_MAX_PER_WINDOW:
        return False

    code = f"{secrets.randbelow(1_000_000):06d}"

    # Send BEFORE touching the DB, deliberately — the old Gmail SMTP
    # version persisted the new code (and invalidated the old one) first,
    # then sent. If the send then failed, the user was left with no valid
    # code at all: the old one dead, the new one never delivered, no way
    # to recover except a fresh login attempt (which the rate limit above
    # would eventually start blocking). Sending first means a delivery
    # failure (see _send_otp_email/OTPDeliveryError) leaves any existing
    # live code untouched and doesn't create a row for a code nobody ever
    # received. Raises OTPDeliveryError on failure — callers must catch it.
    _send_otp_email(user, code)

    # Only one *live* code at a time — invalidate any still-unused ones
    # before issuing a new one (same pattern PasswordResetRequestSerializer
    # already uses for reset tokens), so VerifyOTPSerializer never has to
    # guess which of several unused rows is "the" current code. Only
    # reached once the send above has actually succeeded.
    EmailOTP.objects.filter(user=user, used=False).update(used=True)
    EmailOTP.objects.create(
        user=user,
        code=code,
        expires_at=timezone.now() + timedelta(minutes=OTP_VALIDITY_MINUTES),
    )
    return True


def _otp_required_response(user: User) -> Response:
    # Shared by LoginView (post-password, patients only) and ResendOTPView
    # — both need to react to _generate_and_send_otp()'s three possible
    # outcomes the same way, so the response-construction for each isn't
    # duplicated in two places.
    try:
        sent = _generate_and_send_otp(user)
    except OTPDeliveryError:
        # Distinct from the 429 below — this isn't the caller's fault, so
        # don't tell them to "wait a few minutes" as if a rate limit were
        # the problem when Brevo itself is the one that failed.
        return Response(
            {"detail": "Could not send verification code. Please try again shortly."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    if not sent:
        return Response(
            {"detail": "Too many verification codes requested. Please wait a few minutes and try again."},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )
    return Response(
        {"otp_required": True, "user_id": str(user.id)},
        status=status.HTTP_200_OK,
    )

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

# Google Sign-In — patients only (see PROJECT_CONTEXT.md, "Key principle:
# only Patients self-register"; this is an alternative to email/password
# for that same flow, not a new self-registration path for any other role).

class GoogleSignInView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = GoogleSignInSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.google_payload
        email = payload["email"].strip().lower()
        name = (payload.get("name") or "").strip()

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            user = None

        if user is not None:
            # Existing account, but not a patient — reject clearly rather
            # than silently logging the caller into an ambulance_admin/
            # hospital_admin/etc. account just because the email matched.
            if user.role != Role.PATIENT:
                return Response(
                    {"detail": (
                        "An account with this email already exists for a different role. "
                        "Google sign-in is only available for patient accounts."
                    )},
                    status=status.HTTP_403_FORBIDDEN,
                )
            # Same deactivation check LoginView applies to the email/
            # password path — Google sign-in isn't a way around
            # DeactivateUserView; a deactivated patient still can't get in.
            if not user.is_active:
                return Response(
                    {"detail": "This account has been deactivated. Contact your administrator."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            return Response(_token_response(user), status=status.HTTP_200_OK)

        # No existing account — create one, but only with real consent.
        # popi_consent/terms_consent mirror PatientRegistrationSerializer's
        # own fields and are only asked for here because there's a new
        # account to gate: an existing account (handled above) already
        # went through consent at whatever point it was originally
        # registered. register.tsx sends these from its own checkbox;
        # login.tsx's Google button deliberately doesn't collect consent
        # at all, so it never sends them — that request lands here instead,
        # gets needs_registration back, and the frontend sends the user to
        # register.tsx rather than fabricating consent that was never given.
        if not (request.data.get("popi_consent") and request.data.get("terms_consent")):
            return Response(
                {
                    "detail": "No account found for this Google email. Please complete registration first.",
                    "needs_registration": True,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # No password kwarg — User.objects.create_user()'s default
        # password=None flows into AbstractBaseUser.set_password(None),
        # which Django's make_password(None) produces an unusable-password
        # hash (verified: has_usable_password() is False, check_password()
        # rejects everything including None/'') — the same effect as
        # calling set_unusable_password() explicitly, for free, by simply
        # not passing a password. This account can never log in via the
        # email/password form; only Google again.
        user = User.objects.create_user(
            email=email,
            role=Role.PATIENT,
            institutional_status=InstitutionalStatus.APPROVED,
            full_name=name,
        )
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
        if request.user.role not in (HOSPITAL_ROLES | AMBULANCE_ROLES):
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

        # NOT a prototype bypass (no PROTOTYPE comment guarded this — it was
        # simply never checked). A deactivated account (any role) must not be
        # able to log in; otherwise DeactivateUserView/EMTUpdateView.delete()
        # don't actually do anything real, and the new reactivate endpoint
        # would have nothing genuine to restore.
        if not user.is_active:
            return Response(
                {"detail": "This account has been deactivated. Contact your administrator."},
                status=status.HTTP_403_FORBIDDEN,
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

        # Email OTP second factor — patients only, per project scope
        # (mobile self-registration/login is patient-only; EMTs and every
        # web-side role keep logging in with just email/password, exactly
        # as before this change — nothing below this branch changed).
        if user.role == Role.PATIENT:
            return _otp_required_response(user)

        return Response(_token_response(user), status=status.HTTP_200_OK)

# Email OTP — second factor after email/password (patients only)

class VerifyOTPView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = VerifyOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        return Response(_token_response(user), status=status.HTTP_200_OK)


class ResendOTPView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        try:
            user = User.objects.get(id=request.data.get("user_id"), role=Role.PATIENT)
        except (User.DoesNotExist, ValueError, TypeError, ValidationError):
            # user_id is an opaque UUID the client already holds from the
            # login response, not something worth anti-enumeration effort
            # over (unlike email, it isn't guessable/probeable) — a plain
            # 404 here is more useful to a legitimate caller than a faked
            # success would be.
            return Response(
                {"detail": "Invalid session. Please log in again."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return _otp_required_response(user)

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
    # Only accessible by MERA admins (role='mera_admin' or is_staff=True).

    permission_classes = [permissions.IsAuthenticated, IsMERAAdmin]

    def post(self, request, user_id, decision):
        try:
            user = User.objects.get(
                id=user_id,
                role__in=(HOSPITAL_ROLES | AMBULANCE_ROLES),
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
            role__in=HOSPITAL_ROLES,
            is_active=True,
            institutional_status=InstitutionalStatus.APPROVED,
        ).values('id', 'facility_name', 'facility_type', 'official_address', 'province')
        return Response(list(hospitals))

# MERA Admin: create Hospital Admin / Ambulance Admin accounts
# These accounts are created top-down by MERA staff during institutional
# onboarding — no self-registration, no approval queue (MERA already vetted
# them), so they're created active and APPROVED immediately.

class HospitalAdminCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsMERAAdmin]

    def post(self, request):
        serializer = HospitalAdminCreationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {
                "message": f"Hospital admin account created for {user.get_display_name()}.",
                "user": UserSummarySerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )


class AmbulanceAdminCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsMERAAdmin]

    def post(self, request):
        serializer = AmbulanceAdminCreationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {
                "message": f"Ambulance admin account created for {user.get_display_name()}.",
                "user": UserSummarySerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )

# Ambulance Admin: create EMT accounts under their own service
# Same top-down pattern as above, one level down the hierarchy: the EMT is
# automatically linked to whichever ambulance account created them.

class EMTCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAmbulanceService]

    def post(self, request):
        serializer = EMTCreationSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {
                "message": f"EMT account created for {user.get_display_name()}.",
                "user": UserSummarySerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )


class MyEMTsListView(APIView):
    # GET /auth/admin/my-emts/ — an ambulance_admin's own crew list.
    permission_classes = [permissions.IsAuthenticated, IsAmbulanceService]

    def get(self, request):
        emts = request.user.emts.all()
        return Response(UserSummarySerializer(emts, many=True).data)


class EMTUpdateView(APIView):
    # PATCH  /auth/admin/emts/{id}/ — edit contact details of one of your own EMTs.
    # DELETE /auth/admin/emts/{id}/ — soft-deactivate one of your own EMTs
    # (is_active=False, same pattern institutional approval/rejection uses —
    # see InstitutionalApprovalView. No hard delete anywhere in this codebase;
    # deactivating preserves incident/treatment-note history tied to the EMT
    # and can be reversed, unlike a real delete).

    permission_classes = [permissions.IsAuthenticated, IsAmbulanceService]

    def patch(self, request, emt_id):
        emt = self._get_own_emt(request.user, emt_id)
        serializer = EMTUpdateSerializer(emt, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSummarySerializer(emt).data)

    def delete(self, request, emt_id):
        emt = self._get_own_emt(request.user, emt_id)
        emt.is_active = False
        emt.save(update_fields=["is_active"])
        return Response({"detail": f"{emt.get_display_name()} deactivated."})

    def _get_own_emt(self, ambulance_user, emt_id):
        # 404 (not 403) whether the EMT doesn't exist or just isn't theirs —
        # same choice verification/views.py and medical_profiles/views.py
        # make for ownership-scoped lookups, so ownership isn't leaked.
        from rest_framework.exceptions import NotFound
        try:
            return User.objects.get(id=emt_id, role=Role.EMT, ambulance_service=ambulance_user)
        except User.DoesNotExist:
            raise NotFound("EMT not found.")

# MERA Admin: institutions table (hospital_admin + ambulance_admin, old + new role names)

class InstitutionsListView(APIView):
    # GET /auth/admin/institutions/?search=...
    permission_classes = [permissions.IsAuthenticated, IsMERAAdmin]

    def get(self, request):
        institutions = User.objects.filter(
            role__in=(HOSPITAL_ROLES | AMBULANCE_ROLES)
        ).order_by("-date_joined")
        institutions = _search_filter(institutions, request.query_params.get("search", ""))
        return Response(InstitutionSummarySerializer(institutions, many=True).data)

# MERA Admin: basic platform stats

class PlatformStatsView(APIView):
    # GET /auth/admin/stats/
    # The four role-based counts only count is_active=True accounts — this
    # dashboard means "how many do we currently have", not "how many were
    # ever created", so a deactivated hospital/ambulance/patient/EMT should
    # drop out of its count immediately. total_incidents is unaffected: an
    # Incident has no active/inactive concept of its own.
    permission_classes = [permissions.IsAuthenticated, IsMERAAdmin]

    def get(self, request):
        return Response({
            "total_patients": User.objects.filter(role=Role.PATIENT, is_active=True).count(),
            "total_hospitals": User.objects.filter(role__in=HOSPITAL_ROLES, is_active=True).count(),
            "total_ambulance_services": User.objects.filter(role__in=AMBULANCE_ROLES, is_active=True).count(),
            "total_emts": User.objects.filter(role=Role.EMT, is_active=True).count(),
            "total_incidents": Incident.objects.count(),
        })

# MERA Admin: platform-wide account management

class AllUsersListView(APIView):
    # GET /auth/admin/users/?search=... — every account, any role.
    # Active accounts first, then deactivated ones; most-recently-joined
    # first within each group.
    permission_classes = [permissions.IsAuthenticated, IsMERAAdmin]

    def get(self, request):
        users = User.objects.all().order_by("-is_active", "-date_joined")
        users = _search_filter(users, request.query_params.get("search", ""))
        return Response(AdminUserListSerializer(users, many=True).data)


class AdminUserEditView(APIView):
    # PATCH /auth/admin/users/{id}/ — MERA admin edits any account's basic
    # info. Role and password are deliberately not editable here (role is
    # permanent, password changes go through the password-reset flow).
    permission_classes = [permissions.IsAuthenticated, IsMERAAdmin]

    def patch(self, request, user_id):
        from rest_framework.exceptions import NotFound

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            raise NotFound("User not found.")

        serializer = AdminUserEditSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(AdminUserListSerializer(user).data)


class ReactivateUserView(APIView):
    # PATCH /auth/admin/users/{id}/reactivate/ — the inverse of
    # DeactivateUserView below. No role restriction, mirroring that view
    # (which has none either, aside from its self-lockout guard — that guard
    # has no equivalent here: djangorestframework-simplejwt's
    # JWTAuthentication.get_user() already re-checks is_active against the DB
    # on every authenticated request, not just at login, so a deactivated
    # account's own token already stops working before its next request goes
    # through. A MERA admin literally cannot be authenticated while their own
    # account is inactive, so "reactivate yourself" can't arise through the
    # API — you'd need to already be locked out to attempt it, which is
    # exactly what prevents the attempt).
    #
    # No "already active" guard either, mirroring DeactivateUserView's own
    # lack of an "already inactive" guard — setting is_active to a value it
    # may already hold is an idempotent success on both ends, not an error.
    #
    # Cascading, mirroring DeactivateUserView: reactivating an ambulance_admin
    # (or legacy ambulance_service) also reactivates every EMT that's
    # currently inactive under it. Deactivation cascades specifically so an
    # admin doesn't have to hunt down and deactivate each EMT individually —
    # if reactivation didn't mirror that, the admin would be forced right
    # back into exactly that manual cleanup, just in the other direction.
    # Hospital admins have no subordinate accounts, so nothing cascades there.
    permission_classes = [permissions.IsAuthenticated, IsMERAAdmin]

    def patch(self, request, user_id):
        from rest_framework.exceptions import NotFound

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            raise NotFound("User not found.")

        user.is_active = True
        user.save(update_fields=["is_active"])

        reactivated_emt_count = 0
        if user.role in AMBULANCE_ROLES:
            reactivated_emt_count = user.emts.filter(is_active=False).update(is_active=True)

        detail = f"{user.get_display_name()} reactivated."
        if reactivated_emt_count:
            detail += f" {reactivated_emt_count} linked EMT account(s) were also reactivated."

        return Response({"detail": detail, "reactivated_emt_count": reactivated_emt_count})


class DeactivateUserView(APIView):
    # PATCH /auth/admin/users/{id}/deactivate/ — works for any role,
    # except a MERA admin may not deactivate their own account (self-lockout guard).
    #
    # Cascading: deactivating an ambulance_admin (or legacy ambulance_service)
    # also deactivates every EMT linked to it via the ambulance_service FK —
    # an EMT's account only makes sense in the context of an active service,
    # so leaving them active under a deactivated employer would let them keep
    # responding to incidents on behalf of a service MERA just shut down.
    # Hospital admins have no subordinate accounts, so nothing cascades there.
    permission_classes = [permissions.IsAuthenticated, IsMERAAdmin]

    def patch(self, request, user_id):
        from rest_framework.exceptions import NotFound

        if str(user_id) == str(request.user.id):
            return Response(
                {"detail": "You cannot deactivate your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            raise NotFound("User not found.")

        user.is_active = False
        user.save(update_fields=["is_active"])

        deactivated_emt_count = 0
        if user.role in AMBULANCE_ROLES:
            deactivated_emt_count = user.emts.filter(is_active=True).update(is_active=False)

        detail = f"{user.get_display_name()} deactivated."
        if deactivated_emt_count:
            detail += f" {deactivated_emt_count} linked EMT account(s) were also deactivated."

        return Response({"detail": detail, "deactivated_emt_count": deactivated_emt_count})