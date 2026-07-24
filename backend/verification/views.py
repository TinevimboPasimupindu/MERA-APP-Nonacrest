from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from accounts.permissions import IsHospital, IsPatient
from medical_profiles.serializers import MedicalProfileSerializer

from .models import VerificationRequest, VerificationRequestStatus
from .serializers import (
    HospitalQueueSerializer,
    HospitalVerificationActionSerializer,
    SubmitVerificationRequestSerializer,
    VerificationRequestSerializer,
)
from . import services


class VerificationViewSet(GenericViewSet):
    permission_classes = [permissions.IsAuthenticated]

    # Patient: submit request

    @action(detail=False, methods=["post"], permission_classes=[permissions.IsAuthenticated, IsPatient])
    def submit(self, request):
        profile = getattr(request.user, "medical_profile", None)
        if not profile or profile.verification_status == "unsubmitted":
            return Response(
                {"detail": "Please complete your medical intake form before submitting for verification."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = SubmitVerificationRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ver_request = serializer.save(patient=request.user)

        return Response(
            VerificationRequestSerializer(ver_request).data,
            status=status.HTTP_201_CREATED,
        )

    # Patient: check current status

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated, IsPatient])
    def my_status(self, request):
        latest = (
            VerificationRequest.objects
            .filter(patient=request.user)
            .exclude(status=VerificationRequestStatus.WITHDRAWN)
            .order_by("-submitted_at")
            .first()
        )
        if not latest:
            return Response({"detail": "No verification request found.", "status": "unsubmitted"})
        return Response(VerificationRequestSerializer(latest).data)

    # Hospital: verification queue

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated, IsHospital])
    def queue(self, request):
        pending = VerificationRequest.objects.filter(
            hospital=request.user,
            status__in=[
                VerificationRequestStatus.PENDING,
                VerificationRequestStatus.INFO_REQUESTED,
            ],
        ).select_related("patient").order_by("submitted_at")

        serializer = HospitalQueueSerializer(pending, many=True)
        return Response(serializer.data)

    # Hospital: approved verifications

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated, IsHospital])
    def approved(self, request):
        approved = VerificationRequest.objects.filter(
            hospital=request.user,
            status=VerificationRequestStatus.APPROVED,
        ).select_related("patient").order_by("-reviewed_at")

        serializer = HospitalQueueSerializer(approved, many=True)
        return Response(serializer.data)

    # Hospital: flagged verifications

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated, IsHospital])
    def flagged(self, request):
        flagged = VerificationRequest.objects.filter(
            hospital=request.user,
            status=VerificationRequestStatus.FLAGGED,
        ).select_related("patient").order_by("-reviewed_at")

        serializer = HospitalQueueSerializer(flagged, many=True)
        return Response(serializer.data)

    # Hospital: load patient profile for review

    @action(detail=True, methods=["get"], permission_classes=[permissions.IsAuthenticated, IsHospital])
    def review(self, request, pk=None):
        ver_request = self._get_hospital_request(pk, request.user)
        profile = getattr(ver_request.patient, "medical_profile", None)
        if not profile:
            return Response({"detail": "Patient has no medical profile."}, status=404)
        return Response(MedicalProfileSerializer(profile).data)

    # Hospital: approve / flag / request info

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated, IsHospital])
    def action(self, request, pk=None):
        ver_request = self._get_hospital_request(pk, request.user)

        serializer = HospitalVerificationActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        act = serializer.validated_data["action"]
        note = serializer.validated_data.get("note", "")

        if act == "approve":
            services.approve_verification(ver_request, reviewed_by=request.user)
        elif act == "flag":
            services.flag_verification(ver_request, reviewed_by=request.user, note=note)
        elif act == "request_info":
            services.request_more_info(ver_request, reviewed_by=request.user, note=note)

        return Response(
            {"detail": f"Action '{act}' recorded successfully."},
            status=status.HTTP_200_OK,
        )

    def _get_hospital_request(self, pk, hospital_user):
        try:
            return VerificationRequest.objects.select_related("patient", "hospital").get(
                pk=pk, hospital=hospital_user
            )
        except VerificationRequest.DoesNotExist:
            raise NotFound("Verification request not found.")