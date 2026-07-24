from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from accounts.permissions import IsHospital, IsPatient
from .models import MedicalProfile
from .serializers import (
    ConsentSerializer,
    HospitalProfileUpdateSerializer,
    MedicalIntakeFormSerializer,
    MedicalProfileSerializer,
)


class MedicalProfileViewSet(GenericViewSet):
    permission_classes = [permissions.IsAuthenticated]

    # Patient: view own profile 

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated, IsPatient])
    def me(self, request):
        profile = self._get_own_profile(request.user)
        return Response(MedicalProfileSerializer(profile).data)

    # Patient: submit / resubmit intake form 

    @action(detail=False, methods=["put", "patch"], permission_classes=[permissions.IsAuthenticated, IsPatient])
    def submit(self, request):
        profile = self._get_own_profile(request.user)
        serializer = MedicalIntakeFormSerializer(
            profile, data=request.data,
            partial=(request.method == "PATCH"),
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(MedicalProfileSerializer(profile).data)

    # Patient: toggle consent 

    @action(detail=False, methods=["post"], permission_classes=[permissions.IsAuthenticated, IsPatient])
    def consent(self, request):
        profile = self._get_own_profile(request.user)
        serializer = ConsentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if serializer.validated_data["consent"]:
            profile.grant_consent()
        else:
            profile.withdraw_consent()

        return Response(MedicalProfileSerializer(profile).data)
    
    # Patient: toggle AI chatbot consent 

    @action(detail=False, methods=["post"], permission_classes=[permissions.IsAuthenticated, IsPatient])
    def ai_chatbot_consent_toggle(self, request):
        profile = self._get_own_profile(request.user)
        serializer = ConsentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if serializer.validated_data["consent"]:
            profile.grant_ai_chatbot_consent()
        else:
            profile.withdraw_ai_chatbot_consent()

        return Response(MedicalProfileSerializer(profile).data)

    # Hospital: view a patient's profile 

    @action(
        detail=True, methods=["get"],
        permission_classes=[permissions.IsAuthenticated, IsHospital],
        url_path="hospital_view",
    )
    def hospital_view(self, request, pk=None):
        profile = self._get_patient_profile(pk)
        return Response(MedicalProfileSerializer(profile).data)

    # Hospital: edit a verified patient's profile 

    @action(
        detail=True, methods=["patch"],
        permission_classes=[permissions.IsAuthenticated, IsHospital],
        url_path="hospital_edit",
    )
    def hospital_edit(self, request, pk=None):
        profile = self._get_patient_profile(pk)
        if not profile.is_verified:
            return Response(
                {"detail": "Only verified profiles can be updated by a hospital."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = HospitalProfileUpdateSerializer(
            profile, data=request.data, partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(MedicalProfileSerializer(profile).data)

    # Helpers 

    def _get_own_profile(self, user):
        profile, _ = MedicalProfile.objects.get_or_create(patient=user)
        return profile

    def _get_patient_profile(self, patient_id):
        from rest_framework.exceptions import NotFound
        try:
            return MedicalProfile.objects.select_related("patient").get(
                patient__id=patient_id, patient__role="patient"
            )
        except MedicalProfile.DoesNotExist:
            raise NotFound("Patient medical profile not found.")
