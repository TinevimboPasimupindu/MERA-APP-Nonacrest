# Read-only incident history for the web dashboards (ambulance admin,
# hospital, MERA admin).
#
#   GET /incidents/history/                 paginated, optional ?status=
#   GET /incidents/<uuid>/history_detail/
#
# Deliberately additive: no migrations and no changes to the existing
# incident endpoints/serializers. Everything here is derived from data that
# already exists:
#   - responding EMT: Incident.ambulance_service is service-level only, so
#     the individual EMT is read from the actor on the "ambulance_accepted"
#     EmergencyLog entry (null when the service account accepted directly).
#   - treatment note: the existing TreatmentNote, serialised read-only.
#
# The patient's live medical profile (blood type, conditions, medications,
# allergies) never appears here for any role; nothing below reads
# patient.medical_profile.

from django.db.models import Prefetch
from rest_framework import generics, permissions, serializers
from rest_framework.exceptions import ValidationError

from accounts.models import AMBULANCE_ROLES, HOSPITAL_ROLES, Role
from .models import EmergencyLog, Incident, IncidentStatus
from .serializers import TreatmentNoteSerializer


def is_mera_admin(user):
    # Same rule as accounts.permissions.IsMERAAdmin.
    return user.role == Role.MERA_ADMIN or user.is_staff


def history_queryset(user):
    # Scoping lives here, in the queryset, so the list and the detail view
    # can't disagree: anything outside it is absent from the list and a 404
    # on detail. EMTs and patients have no web dashboard and get nothing.
    if is_mera_admin(user):
        qs = Incident.objects.all()
    elif user.role in AMBULANCE_ROLES:
        qs = Incident.objects.filter(ambulance_service=user)
    elif user.role in HOSPITAL_ROLES:
        qs = Incident.objects.filter(destination_hospital=user)
    else:
        return Incident.objects.none()

    # One query for the incidents (with patient, service, hospital and note
    # joined) plus one for every page's accept entries and their actors,
    # instead of ~4 extra queries per incident.
    accepted = EmergencyLog.objects.filter(event_type="ambulance_accepted").select_related("actor")
    return (
        qs.select_related("patient", "ambulance_service", "destination_hospital", "treatment_note")
        .prefetch_related(Prefetch("log_entries", queryset=accepted, to_attr="accept_entries"))
        .order_by("-triggered_at")
    )


def responding_emt(incident):
    entries = getattr(incident, "accept_entries", None)
    if not entries:
        return None
    actor = entries[-1].actor
    if actor is None or actor.role != Role.EMT:
        return None
    return {"id": actor.id, "full_name": actor.get_full_name()}


def _name(user):
    return user.get_full_name() if user else None


class _HistoryBase(serializers.ModelSerializer):
    institution = serializers.SerializerMethodField()
    responding_emt = serializers.SerializerMethodField()
    hospital = serializers.SerializerMethodField()

    TIMESTAMPS = [
        "triggered_at", "confirmed_at", "accepted_at",
        "arrived_at", "completed_at", "cancelled_at",
    ]

    def get_institution(self, obj):
        return _name(obj.ambulance_service)

    def get_responding_emt(self, obj):
        return responding_emt(obj)

    def get_hospital(self, obj):
        return _name(obj.destination_hospital)


class IncidentHistoryAdminSerializer(_HistoryBase):
    # MERA admin: operational fields only. No patient details, no notes.
    # tests.py asserts this exact key set, so adding a field is deliberate.
    class Meta:
        model = Incident
        fields = ["id", "status", "institution", "responding_emt", "hospital"] + _HistoryBase.TIMESTAMPS
        read_only_fields = fields


class IncidentHistoryInstitutionSerializer(_HistoryBase):
    # Ambulance admin and hospital: adds the patient's name and the existing
    # treatment note, read-only. Still no medical profile fields.
    patient_name = serializers.SerializerMethodField()
    treatment_note = TreatmentNoteSerializer(read_only=True)

    class Meta:
        model = Incident
        fields = (
            ["id", "status", "patient_name", "institution", "responding_emt", "hospital"]
            + _HistoryBase.TIMESTAMPS
            + ["treatment_note"]
        )
        read_only_fields = fields

    def get_patient_name(self, obj):
        return _name(obj.patient)


class _HistoryMixin:
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if is_mera_admin(self.request.user):
            return IncidentHistoryAdminSerializer
        return IncidentHistoryInstitutionSerializer

    def get_queryset(self):
        return history_queryset(self.request.user)


class IncidentHistoryListView(_HistoryMixin, generics.ListAPIView):
    # Paginated by the project default (PageNumberPagination, PAGE_SIZE 20).

    def get_queryset(self):
        qs = super().get_queryset()
        wanted = self.request.query_params.get("status")
        if wanted:
            if wanted not in IncidentStatus.values:
                raise ValidationError({"status": f"Unknown status '{wanted}'."})
            qs = qs.filter(status=wanted)
        return qs


class IncidentHistoryDetailView(_HistoryMixin, generics.RetrieveAPIView):
    lookup_url_kwarg = "incident_id"
