import logging

from django.db.models import Q
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.models import HOSPITAL_ROLES, Role, User
from accounts.permissions import IsHospital, IsMERAAdmin, IsPatient

from .models import Incident, IncidentStatus, NFCTag, TreatmentNote
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
    NFCTagAdminSerializer,
    NFCTagGenerateSerializer,
    NFCTagPairSerializer,
    NFCTriggerSerializer,
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
            incident, created = services.trigger_sos(request.user, serializer.validated_data)
        except PermissionError as exc:
            raise PermissionDenied(str(exc))

        # 201 for a genuinely new incident, 200 when an already-active one
        # was returned instead (see services.trigger_sos's duplicate-
        # prevention comment) — no new resource was created in that case.
        return Response(
            IncidentPatientSerializer(incident).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
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


# NFC Emergency Tags — MERA admin management
#
# See PROJECT_CONTEXT.md's NFC tags section for the business model:
# tags are manufactured/sold as pre-paired inventory. A MERA admin
# generates a batch here, someone writes each token's URL onto a physical
# NFC sticker OUTSIDE this app, and later — when a tag is actually sold/
# issued to a patient — an admin pairs that specific tag via its short
# code (read off the physical sticker; a browser-based admin panel can't
# scan NFC directly).

class NFCTagGenerateView(APIView):
    # POST /nfc-tags/generate/ — batch-create N unpaired tags. Returns
    # their short codes + full URLs so the admin can note/print them
    # before writing them to physical stickers.
    permission_classes = [permissions.IsAuthenticated, IsMERAAdmin]

    def post(self, request):
        serializer = NFCTagGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tags = services.generate_nfc_tags(serializer.validated_data["count"])
        return Response(
            NFCTagAdminSerializer(tags, many=True).data,
            status=status.HTTP_201_CREATED,
        )


class NFCTagListView(APIView):
    # GET /nfc-tags/?paired=true|false | ?voided=true — every tag,
    # optionally filtered. Unfiltered by default (paired, unpaired AND
    # voided). paired=true/false only match LIVE tags (voided ones are
    # excluded — a voided tag is neither usable-and-paired nor inventory);
    # voided=true lists just the voided ones.
    permission_classes = [permissions.IsAuthenticated, IsMERAAdmin]

    def get(self, request):
        tags = NFCTag.objects.select_related("patient").all()
        paired = request.query_params.get("paired")
        voided = request.query_params.get("voided")
        if voided is not None and voided.lower() in ("true", "1"):
            tags = tags.filter(voided_at__isnull=False)
        elif paired is not None:
            if paired.lower() in ("true", "1"):
                tags = tags.filter(patient__isnull=False, voided_at__isnull=True)
            elif paired.lower() in ("false", "0"):
                tags = tags.filter(patient__isnull=True, voided_at__isnull=True)
        return Response(NFCTagAdminSerializer(tags, many=True).data)


class _NFCTagActionView(APIView):
    # Shared shape for the per-tag admin actions below: look the tag up by
    # id (404 if unknown), run one service function, map its
    # NFCTagPairingError to a clear 400, return the updated tag.
    permission_classes = [permissions.IsAuthenticated, IsMERAAdmin]
    service_action = None  # set by subclasses

    def post(self, request, tag_id):
        try:
            tag = NFCTag.objects.select_related("patient").get(pk=tag_id)
        except NFCTag.DoesNotExist:
            return Response({"detail": "Tag not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            tag = type(self).service_action(tag)
        except services.NFCTagPairingError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response(NFCTagAdminSerializer(tag).data)


class NFCTagUnpairView(_NFCTagActionView):
    # POST /nfc-tags/{id}/unpair/ — detach from the current patient; the
    # token stays valid so the sticker can be re-paired to someone else.
    service_action = staticmethod(services.unpair_nfc_tag)


class NFCTagVoidView(_NFCTagActionView):
    # POST /nfc-tags/{id}/void/ — permanently invalidate the token (soft
    # void, kept for audit; see NFCTag.voided_at).
    service_action = staticmethod(services.void_nfc_tag)


class NFCTagPairView(APIView):
    # POST /nfc-tags/pair/ {short_code, patient_id} — attach a specific
    # physical tag to a patient's account. Rejects an already-paired tag
    # or an unrecognized short code (services.pair_nfc_tag distinguishes
    # the two with separate messages).
    permission_classes = [permissions.IsAuthenticated, IsMERAAdmin]

    def post(self, request):
        serializer = NFCTagPairSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            patient = User.objects.get(
                pk=serializer.validated_data["patient_id"], role=Role.PATIENT
            )
        except User.DoesNotExist:
            raise ValidationError({"patient_id": "Patient not found."})

        try:
            tag = services.pair_nfc_tag(serializer.validated_data["short_code"], patient)
        except services.NFCTagPairingError as exc:
            raise ValidationError({"short_code": str(exc)})

        return Response(NFCTagAdminSerializer(tag).data)


# NFC Emergency Tags — public, unauthenticated bystander flow
#
# Both views below are deliberately outside IncidentViewSet: every action
# on that viewset defaults to IsAuthenticated (see its class-level
# permission_classes), and these two are the one place in this app that
# must work for a bystander with no MERA account at all — the whole point
# of a physical tag is that whoever taps it never logs in.

class NFCTagTriggerThrottle(ScopedRateThrottle):
    # A leaked/scanned token URL could otherwise be replayed indefinitely
    # — DRF's ScopedRateThrottle keys an anonymous caller by IP by default
    # (self.get_ident), which doesn't bound a single token being replayed
    # from many different IPs/devices. Keyed on the token itself instead
    # (already a long, unguessable value — see NFCTag.token), so the SAME
    # physical tag can only be retriggered a handful of times per window
    # regardless of caller IP. Documented as an accepted residual risk in
    # PROJECT_CONTEXT.md, same tier as the three existing prototype
    # bypasses — not hardened further than this for this prototype's scope
    # (no captcha, no device fingerprinting, no per-IP+token combination).
    scope = "nfc_trigger"

    def get_cache_key(self, request, view):
        token = view.kwargs.get("token", "")
        return self.cache_format % {"scope": self.scope, "ident": token}


class NFCTagStatusView(APIView):
    # GET /nfc/<token>/ — fully public. Returns the tag's current state
    # only: "invalid" (no such token), "unpaired" (not activated yet),
    # "paired" (activated, no active incident), or "active_incident"
    # (already alerted). Never the patient's name or any medical/incident
    # detail — status only, by design (see PROJECT_CONTEXT.md).
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request, token):
        try:
            tag = NFCTag.objects.get(token=token)
        except NFCTag.DoesNotExist:
            return Response({"status": "invalid"})
        return Response({"status": services.nfc_tag_status(tag)})


class NFCTagTriggerView(APIView):
    # POST /nfc/<token>/trigger/ — fully public. Creates and confirms an
    # Incident for the tag's paired patient via the SAME trigger_sos()/
    # confirm_sos() functions the authenticated mobile SOS button uses —
    # this is a new trigger SOURCE for the existing incident pipeline, not
    # a parallel one, so every downstream consequence (emergency-contact
    # SMS, hospital selection, EMT dispatch, ...) is unchanged. Rejects an
    # unpaired tag and a patient who already has a non-terminal incident —
    # see services.trigger_nfc_sos for how that reuses trigger_sos's own
    # duplicate-prevention logic rather than a second copy of it.
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [NFCTagTriggerThrottle]
    # ScopedRateThrottle.allow_request() reads view.throttle_scope (not the
    # throttle class's own `scope` attribute) to decide the rate AND to set
    # self.scope before get_cache_key() runs — without this, allow_request
    # short-circuits to "not throttled" for every request (it checks
    # hasattr(view, "throttle_scope") first). Same convention as
    # TriggerPasswordResetView's throttle_scope elsewhere in this codebase.
    throttle_scope = "nfc_trigger"

    def post(self, request, token):
        try:
            tag = NFCTag.objects.get(token=token, voided_at__isnull=True)
        except NFCTag.DoesNotExist:
            # A voided tag is indistinguishable from an unknown one.
            return Response({"detail": "Invalid or unknown tag."}, status=status.HTTP_404_NOT_FOUND)

        # Location is required (see _RequiredLocationFields) — validated
        # AFTER the tag lookup so an unknown token is still a 404 rather
        # than a misleading "missing location" 400, and BEFORE the service
        # so a request without coordinates can never create an incident.
        serializer = NFCTriggerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            services.trigger_nfc_sos(tag, serializer.validated_data)
        except services.NFCTagUnpairedError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except services.NFCTagDuplicateIncidentError as exc:
            # Never echoes the existing incident's id/data back to an
            # anonymous caller — same "status only, no patient/incident
            # detail" rule the GET status endpoint follows. A bystander
            # who reaches this branch already saw "active_incident" from
            # GET .../nfc/<token>/ before tapping confirm.
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)

        # Deliberately does NOT return the created Incident's data — same
        # "no patient-identifying info in any response" rule the whole
        # public NFC flow follows (see PROJECT_CONTEXT.md). The web
        # frontend's confirm page only ever needs to know it succeeded.
        return Response({"detail": "Help has been alerted."}, status=status.HTTP_201_CREATED)