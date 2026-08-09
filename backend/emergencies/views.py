import logging

from django.db.models import Q
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from accounts.models import HOSPITAL_ROLES
from accounts.permissions import IsHospital, IsPatient

from .models import Incident, IncidentStatus, TreatmentNote
from .permissions import (
    AMBULANCE_RESPONDER_ROLES,
    IsAcceptingAmbulance,
    IsAmbulanceResponder,
    IsDestinationHospital,
    IsIncidentPatient,
    IsIncidentPatientOrAssignedAmbulance,
)
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
    UpdateLocationSerializer,
    UpdateStatusSerializer,
)
from . import services

logger = logging.getLogger(__name__)


class IncidentViewSet(viewsets.GenericViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == "patient":
            return Incident.objects.filter(patient=user)
        if user.role in AMBULANCE_RESPONDER_ROLES:
            # For an EMT, effective_ambulance_service resolves to their
            # ambulance_admin — so an EMT sees the same assigned incidents
            # their service does, not just ones assigned to their own account.
            account = user.effective_ambulance_service
            q = Q(status=IncidentStatus.ACTIVE)
            if account is not None:
                q |= Q(ambulance_service=account)
            return Incident.objects.filter(q)
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

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated, IsAmbulanceResponder])
    def active_alerts(self, request):
        alerts = Incident.objects.filter(
            status=IncidentStatus.ACTIVE,
            ambulance_service__isnull=True,
        ).order_by("triggered_at")

        serializer = IncidentAmbulanceBroadcastSerializer(alerts, many=True)
        return Response(serializer.data)

    # AMBULANCE: Accept alert

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated, IsAmbulanceResponder])
    def accept(self, request, pk=None):
        try:
            incident = Incident.objects.get(pk=pk)
        except Incident.DoesNotExist:
            return Response({"detail": "Incident not found."}, status=status.HTTP_404_NOT_FOUND)

        # Resolves to request.user's ambulance_admin if they're an EMT,
        # or request.user themselves otherwise — see User.effective_ambulance_service.
        ambulance_account = request.user.effective_ambulance_service
        if ambulance_account is None:
            return Response(
                {"detail": "Your account is not linked to an ambulance service."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            incident = services.accept_incident(
                incident, ambulance_service=ambulance_account, actor=request.user
            )
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

    # PATIENT or ASSIGNED AMBULANCE: Route (Google Routes API, server-side)

    @action(detail=True, methods=["get"], permission_classes=[permissions.IsAuthenticated, IsIncidentPatientOrAssignedAmbulance])
    def route(self, request, pk=None):
        # Not looked up via _get_own_incident/_get_assigned_incident since
        # this is the one endpoint both the patient AND the assigned
        # ambulance can call — IsIncidentPatientOrAssignedAmbulance covers
        # both, checked as an object permission the same way medical_detail
        # checks IsAcceptingAmbulance above.
        incident = self._get_incident_object(pk)
        self.check_object_permissions(request, incident)

        if incident.latitude is None or incident.longitude is None:
            return Response({"available": False, "detail": "Patient location is not available."})
        if incident.ambulance_lat is None or incident.ambulance_lng is None:
            return Response({"available": False, "detail": "Ambulance location is not available yet."})

        try:
            route_data = services.get_route(
                origin_lat=incident.ambulance_lat,
                origin_lng=incident.ambulance_lng,
                dest_lat=float(incident.latitude),
                dest_lng=float(incident.longitude),
            )
        except Exception as exc:  # noqa: BLE001 — mirrors chatbot/views.py's handling of external API failures
            logger.warning("Routes API call failed for incident %s: %r", incident.id, exc)
            return Response(
                {"detail": "Route information is currently unavailable. Please try again shortly."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({"available": True, **route_data})

    # AMBULANCE: Select hospital

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated, IsAmbulanceResponder])
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

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated, IsAmbulanceResponder])
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

    # AMBULANCE: Live location update

    @action(detail=True, methods=["patch"], permission_classes=[permissions.IsAuthenticated, IsAmbulanceResponder])
    def update_location(self, request, pk=None):
        # Same ownership resolution as select_hospital/update_status/
        # treatment_notes above: _get_assigned_incident() 404s (not 403) if
        # this incident isn't assigned to the requester's ambulance service,
        # so a mismatched EMT/ambulance can't tell the difference between
        # "not yours" and "doesn't exist."
        incident = self._get_assigned_incident(pk)
        serializer = UpdateLocationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        incident = services.update_ambulance_location(
            incident,
            lat=serializer.validated_data["ambulance_lat"],
            lng=serializer.validated_data["ambulance_lng"],
        )
        return Response(IncidentAmbulanceActiveSerializer(incident).data)

    # AMBULANCE: Treatment notes

    @action(detail=True, methods=["post", "patch"], permission_classes=[permissions.IsAuthenticated, IsAmbulanceResponder])
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

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated, IsAmbulanceResponder])
    def my_responses(self, request):
        # Resolves to the EMT's ambulance_admin so this also includes
        # incidents accepted by any EMT on the same crew, not just this user.
        account = request.user.effective_ambulance_service
        if account is None:
            return Response([])
        incidents = Incident.objects.filter(
            ambulance_service=account
        ).order_by("-triggered_at")
        serializer = IncidentAmbulanceActiveSerializer(incidents, many=True)
        return Response(serializer.data)

    # PATIENT or AMBULANCE/EMT: my in-progress incident, for app-launch restore

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated], url_path="my_active")
    def my_active(self, request):
        # SC-01 support: on mobile app launch, restore an in-progress
        # emergency (patient's own active SOS, or the EMT/ambulance's
        # currently assigned response) instead of always landing on the
        # role's normal dashboard. "In progress" is everything except
        # COMPLETED/CANCELLED, via exclude() rather than an explicit
        # include-list so a future new intermediate status is
        # automatically covered without needing this view updated too.
        user = request.user
        terminal = [IncidentStatus.COMPLETED, IncidentStatus.CANCELLED]

        if user.role == "patient":
            incident = (
                Incident.objects.filter(patient=user)
                .exclude(status__in=terminal)
                .order_by("-triggered_at")
                .first()
            )
            if incident:
                return Response({"active_incident": IncidentPatientSerializer(incident).data})
            return Response({"active_incident": None})

        if user.role in AMBULANCE_RESPONDER_ROLES:
            account = user.effective_ambulance_service
            if account is not None:
                # Only fetch 2 — we just need to know "is there more than
                # one candidate", not the full set.
                candidates = list(
                    Incident.objects.filter(ambulance_service=account)
                    .exclude(status__in=terminal)
                    .order_by("-triggered_at")[:2]
                )
                # Incident.ambulance_service is service-level, not
                # per-EMT (see PROJECT_CONTEXT.md — incident attribution
                # doesn't track which individual EMT is on which
                # incident). If a service has multiple EMTs each mid-
                # response on a *different* incident at once, this query
                # can't tell which one belongs to the requesting EMT
                # specifically. Guessing wrong would silently route an
                # EMT into a colleague's response for a different
                # patient, which is worse than just not auto-routing —
                # so only auto-route when there's exactly one candidate;
                # otherwise fall back to the normal dashboard.
                if len(candidates) == 1:
                    return Response(
                        {"active_incident": IncidentAmbulanceActiveSerializer(candidates[0]).data}
                    )
            return Response({"active_incident": None})

        return Response({"active_incident": None})

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
        # Same resolution as get_queryset()/my_responses() — an EMT looking
        # up "my assigned incident" means "my ambulance_admin's assigned
        # incident", so this also covers select_hospital/update_status/
        # treatment_notes, all of which call this helper.
        from rest_framework.exceptions import NotFound
        account = self.request.user.effective_ambulance_service
        if account is None:
            raise NotFound("Incident not found or not assigned to your service.")
        try:
            return Incident.objects.get(pk=pk, ambulance_service=account)
        except Incident.DoesNotExist:
            raise NotFound("Incident not found or not assigned to your service.")

    def _get_incident_object(self, pk):
        try:
            return Incident.objects.get(pk=pk)
        except Incident.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound("Incident not found.")