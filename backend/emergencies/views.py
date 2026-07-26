from django.db.models import Q
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from accounts.models import AMBULANCE_ROLES, HOSPITAL_ROLES
from accounts.permissions import IsAmbulanceService, IsHospital, IsPatient

from .models import Incident, IncidentStatus, TreatmentNote
from .permissions import IsAcceptingAmbulance, IsDestinationHospital, IsIncidentPatient
from .serializers import (
    AcceptIncidentSerializer,
    CancelIncidentSerializer,
    ConfirmSOSSerializer,
    IncidentAmbulanceActiveSerializer,
    IncidentAmbulanceBroadcastSerializer,
    IncidentHospitalIncomingSerializer,
    IncidentPatientSerializer,
    SOSTriggerSerializer,
    SelectHospitalSerializer,
    TreatmentNoteSerializer,
    UpdateStatusSerializer,
)
from . import services


class IncidentViewSet(viewsets.GenericViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == "patient":
            return Incident.objects.filter(patient=user)
        if user.role in AMBULANCE_ROLES:
            return Incident.objects.filter(
                Q(status=IncidentStatus.ACTIVE) | Q(ambulance_service=user)
            )
        if user.role in HOSPITAL_ROLES:
            return Incident.objects.filter(destination_hospital=user)
        return Incident.objects.none()

    def get_serializer_class(self):
        return IncidentPatientSerializer

    # LIST — patient emergency history

    def list(self, request):
        if request.user.role != "patient":
            return Response(status=status.HTTP_403_FORBIDDEN)
        qs = Incident.objects.filter(patient=request.user).order_by("-triggered_at")
        serializer = IncidentPatientSerializer(qs, many=True)
        return Response(serializer.data)

    def retrieve(self, request, pk=None):
        incident = self._get_own_incident(pk)
        serializer = IncidentPatientSerializer(incident)
        return Response(serializer.data)

    # PATIENT: Trigger SOS

    @action(detail=False, methods=["post"], permission_classes=[permissions.IsAuthenticated, IsPatient])
    def trigger_sos(self, request):
        serializer = SOSTriggerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            incident = services.trigger_sos(request.user, serializer.validated_data)
        except PermissionError as exc:
            raise PermissionDenied(str(exc))

        return Response(
            IncidentPatientSerializer(incident).data,
            status=status.HTTP_201_CREATED,
        )

    # PATIENT: Confirm SOS

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated, IsPatient])
    def confirm(self, request, pk=None):
        incident = self._get_own_incident(pk)
        serializer = ConfirmSOSSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            incident = services.confirm_sos(incident, method=serializer.validated_data["activation_method"])
        except ValueError as exc:
            raise ValidationError(str(exc))

        return Response(IncidentPatientSerializer(incident).data)

    # PATIENT: Cancel

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated, IsPatient])
    def cancel(self, request, pk=None):
        incident = self._get_own_incident(pk)
        serializer = CancelIncidentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            incident = services.cancel_incident(
                incident,
                cancelled_by=request.user,
                reason=serializer.validated_data.get("reason", ""),
            )
        except ValueError as exc:
            raise ValidationError(str(exc))

        return Response(IncidentPatientSerializer(incident).data)

    # AMBULANCE: Active alert broadcast list

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated, IsAmbulanceService])
    def active_alerts(self, request):
        alerts = Incident.objects.filter(
            status=IncidentStatus.ACTIVE,
            ambulance_service__isnull=True,
        ).order_by("triggered_at")

        serializer = IncidentAmbulanceBroadcastSerializer(alerts, many=True)
        return Response(serializer.data)

    # AMBULANCE: Accept alert

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated, IsAmbulanceService])
    def accept(self, request, pk=None):
        try:
            incident = Incident.objects.get(pk=pk)
        except Incident.DoesNotExist:
            return Response({"detail": "Incident not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            incident = services.accept_incident(incident, ambulance_user=request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)

        return Response(IncidentAmbulanceActiveSerializer(incident).data)

    # AMBULANCE: Medical detail after accept

    @action(
        detail=True,
        methods=["get"],
        permission_classes=[permissions.IsAuthenticated, IsAcceptingAmbulance],
        url_path="medical_detail",
    )
    def medical_detail(self, request, pk=None):
        incident = self._get_incident_object(pk)
        self.check_object_permissions(request, incident)
        serializer = IncidentAmbulanceActiveSerializer(incident)
        return Response(serializer.data)

    # AMBULANCE: Select hospital

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated, IsAmbulanceService])
    def select_hospital(self, request, pk=None):
        incident = self._get_assigned_incident(pk)
        serializer = SelectHospitalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from accounts.models import User
        try:
            hospital_user = User.objects.get(
                pk=serializer.validated_data["hospital_user_id"],
                role__in=HOSPITAL_ROLES,
            )
        except User.DoesNotExist:
            raise ValidationError({"hospital_user_id": "Hospital not found."})

        incident = services.select_destination_hospital(
            incident,
            hospital_user=hospital_user,
            eta_minutes=serializer.validated_data["eta_minutes"],
        )
        return Response(IncidentAmbulanceActiveSerializer(incident).data)

    # AMBULANCE: Update status

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated, IsAmbulanceService])
    def update_status(self, request, pk=None):
        incident = self._get_assigned_incident(pk)
        serializer = UpdateStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            incident = services.update_incident_status(
                incident,
                new_status=serializer.validated_data["status"],
                actor=request.user,
            )
        except ValueError as exc:
            raise ValidationError(str(exc))

        return Response(IncidentAmbulanceActiveSerializer(incident).data)

    # AMBULANCE: Treatment notes

    @action(detail=True, methods=["post", "patch"], permission_classes=[permissions.IsAuthenticated, IsAmbulanceService])
    def treatment_notes(self, request, pk=None):
        incident = self._get_assigned_incident(pk)
        serializer = TreatmentNoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        note = services.submit_treatment_notes(
            incident,
            author=request.user,
            data=serializer.validated_data,
        )
        return Response(TreatmentNoteSerializer(note).data, status=status.HTTP_200_OK)

    # AMBULANCE: My response history

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated, IsAmbulanceService])
    def my_responses(self, request):
        incidents = Incident.objects.filter(
            ambulance_service=request.user
        ).order_by("-triggered_at")
        serializer = IncidentAmbulanceActiveSerializer(incidents, many=True)
        return Response(serializer.data)

    # HOSPITAL: Incoming patients panel

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated, IsHospital])
    def incoming_patients(self, request):
        incidents = Incident.objects.filter(
            destination_hospital=request.user,
            status__in=[
                IncidentStatus.DISPATCHED,
                IncidentStatus.ON_THE_WAY,
                IncidentStatus.ARRIVED_ON_SCENE,
            ],
        ).order_by("eta_minutes")

        serializer = IncidentHospitalIncomingSerializer(incidents, many=True)
        return Response(serializer.data)

    # HOSPITAL: Mark ready to receive

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated, IsHospital])
    def mark_ready(self, request, pk=None):
        try:
            incident = Incident.objects.get(pk=pk, destination_hospital=request.user)
        except Incident.DoesNotExist:
            return Response({"detail": "Incident not found."}, status=status.HTTP_404_NOT_FOUND)

        from django.utils import timezone
        from .models import EmergencyLog

        EmergencyLog.objects.create(
            incident=incident,
            event_type="hospital_notified",
            description="Hospital marked as ready to receive patient.",
            actor=request.user,
        )
        return Response({"detail": "Marked ready to receive."}, status=status.HTTP_200_OK)


    # HOSPITAL: Incident detail for incoming patient screen

    @action(detail=True, methods=["get"], permission_classes=[permissions.IsAuthenticated, IsHospital])
    def hospital_detail(self, request, pk=None):
        try:
            incident = Incident.objects.get(pk=pk, destination_hospital=request.user)
        except Incident.DoesNotExist:
            return Response({"detail": "Incident not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = IncidentHospitalIncomingSerializer(incident)
        return Response(serializer.data)

    # OFFLINE: Transmit queued SOS

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated, IsPatient])
    def transmit_offline(self, request, pk=None):
        incident = self._get_own_incident(pk)

        from .tasks import transmit_offline_queue_task
        transmit_offline_queue_task.delay(str(incident.id))

        return Response({"detail": "Offline alert queued for transmission."}, status=status.HTTP_202_ACCEPTED)

    # Private helpers

    def _get_own_incident(self, pk):
        try:
            return Incident.objects.get(pk=pk, patient=self.request.user)
        except Incident.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound("Incident not found.")

    def _get_assigned_incident(self, pk):
        try:
            return Incident.objects.get(pk=pk, ambulance_service=self.request.user)
        except Incident.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound("Incident not found or not assigned to your service.")

    def _get_incident_object(self, pk):
        try:
            return Incident.objects.get(pk=pk)
        except Incident.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound("Incident not found.")