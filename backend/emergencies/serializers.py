from django.conf import settings
from rest_framework import serializers
from .models import EmergencyLog, Incident, IncidentStatus, NFCTag, TreatmentNote

# Emergency Log

class EmergencyLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmergencyLog
        fields = [
            "id", "event_type", "description",
            "latitude", "longitude",
            "actor", "logged_at",
        ]
        read_only_fields = fields

# Treatment Notes

class TreatmentNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = TreatmentNote
        fields = [
            "id",
            "chief_complaint",
            "treatment_administered",
            "blood_pressure",
            "spo2",
            "heart_rate",
            "medications_given",
            "additional_notes",
            "is_draft",
            "submitted_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "submitted_at", "created_at", "updated_at"]

    def validate(self, attrs):
        # chief_complaint and treatment_administered are required on submit.
        is_draft = attrs.get("is_draft", getattr(self.instance, "is_draft", False))
        if not is_draft:
            if not attrs.get("chief_complaint", getattr(self.instance, "chief_complaint", "")):
                raise serializers.ValidationError(
                    {"chief_complaint": "Required when submitting (not a draft)."}
                )
            if not attrs.get("treatment_administered", getattr(self.instance, "treatment_administered", "")):
                raise serializers.ValidationError(
                    {"treatment_administered": "Required when submitting (not a draft)."}
                )
        return attrs

# Incident — Patient view (full detail, owns the incident)

class IncidentPatientSerializer(serializers.ModelSerializer):
    # Patient sees full history — ambulance details, hospital, treatment notes.

    log_entries = EmergencyLogSerializer(many=True, read_only=True)
    treatment_note = TreatmentNoteSerializer(read_only=True)

    # ambulance_service/destination_hospital are left in as plain FK ids
    # (existing behavior — some frontend truthy checks key off their
    # presence, not their content) but a bare FK on a ModelSerializer
    # serializes to its primary key by default, which for User is a UUID —
    # not something to display as-is. These two give the frontend an
    # actual human-readable name, same pattern IncidentHospitalIncomingSerializer
    # already uses for get_ambulance_name below, but via User.get_display_name()
    # for full correctness (facility_name/service_name/full_name resolution,
    # not just the ambulance-only service_name lookup that pattern used).
    ambulance_service_name = serializers.SerializerMethodField()
    destination_hospital_name = serializers.SerializerMethodField()

    class Meta:
        model = Incident
        fields = [
            "id", "status", "priority_level", "activation_method",
            "latitude", "longitude",
            "triggered_at", "confirmed_at", "accepted_at",
            "arrived_at", "completed_at", "cancelled_at",
            "ambulance_service", "ambulance_service_name",
            "destination_hospital", "destination_hospital_name",
            "eta_minutes",
            "ambulance_lat", "ambulance_lng",
            "was_offline_queued",
            "treatment_note",
            "log_entries",
        ]
        read_only_fields = fields

    def get_ambulance_service_name(self, obj):
        return obj.ambulance_service.get_display_name() if obj.ambulance_service else None

    def get_destination_hospital_name(self, obj):
        return obj.destination_hospital.get_display_name() if obj.destination_hospital else None

# Incident — Ambulance broadcast list view (NO medical data)

class IncidentAmbulanceBroadcastSerializer(serializers.ModelSerializer):
    # Ambulance sees location, distance, time since trigger, priority.
    # Medical data is EXCLUDED until the service accepts.

    patient_display_name = serializers.SerializerMethodField()
    time_since_trigger_seconds = serializers.SerializerMethodField()

    class Meta:
        model = Incident
        fields = [
            "id",
            "priority_level",
            "latitude",
            "longitude",
            "triggered_at",
            "time_since_trigger_seconds",
            "patient_display_name",  # first name only for triage card
        ]
        read_only_fields = fields

    def get_patient_display_name(self, obj):
     return obj.patient.full_name or "Unknown Patient"

    def get_time_since_trigger_seconds(self, obj):
        from django.utils import timezone
        delta = timezone.now() - obj.triggered_at
        return int(delta.total_seconds())

# Incident — Ambulance active response view (WITH medical data after accept)

class IncidentAmbulanceActiveSerializer(serializers.ModelSerializer):
    # Full medical profile shown only to the accepting ambulance service.
    # Access restricted to accepting service only (enforced in view).

    treatment_note = TreatmentNoteSerializer(read_only=True)
    log_entries = EmergencyLogSerializer(many=True, read_only=True)

    # Medical summary pulled from the patient's MedicalProfile
    medical_summary = serializers.SerializerMethodField()

    class Meta:
        model = Incident
        fields = [
            "id", "status", "priority_level",
            "latitude", "longitude",
            "triggered_at", "confirmed_at", "accepted_at",
            "arrived_at", "eta_minutes",
            "destination_hospital",
            "ambulance_lat", "ambulance_lng",
            "medical_summary",
            "treatment_note",
            "log_entries",
        ]
        read_only_fields = fields

    def get_medical_summary(self, obj):
        # Pull verified medical profile fields for the ambulance responder.
        # Returns None if profile is not verified (should not happen in practice).

        try:
            profile = obj.patient.medical_profile
            return {
                "full_name": obj.patient.get_full_name(),
                "blood_type": profile.blood_type,
                "chronic_conditions": profile.chronic_conditions,
                "current_medications": profile.current_medications,
                "known_allergies": profile.known_allergies,
                "paramedic_notes": profile.paramedic_notes,
                "verification_status": profile.verification_status,
            }
        except Exception:  # noqa: BLE001
            return None

# Incident — Hospital incoming patient panel

class IncidentHospitalIncomingSerializer(serializers.ModelSerializer):
    # Hospital sees ETA, condition summary, ambulance treatment notes.

    treatment_note = TreatmentNoteSerializer(read_only=True)
    patient_summary = serializers.SerializerMethodField()
    ambulance_name = serializers.SerializerMethodField()

    class Meta:
        model = Incident
        fields = [
            "id", "status",
            "eta_minutes",
            "accepted_at",
            "ambulance_name",
            "patient_summary",
            "treatment_note",
        ]
        read_only_fields = fields

    def get_patient_summary(self, obj):
        try:
            profile = obj.patient.medical_profile
            return {
                "full_name": obj.patient.get_full_name(),
                "blood_type": profile.blood_type,
                "chronic_conditions": profile.chronic_conditions,
                "known_allergies": profile.known_allergies,
            }
        except Exception:  # noqa: BLE001
            return {}

    def get_ambulance_name(self, obj):
        if obj.ambulance_service:
            return getattr(obj.ambulance_service, "service_name", str(obj.ambulance_service))
        return None

# SOS Trigger input serializer

# Coordinates are REQUIRED on every trigger path (this one and the public NFC
# one below): MERA can't send help to the right place without them, and a
# location-less incident used to be created silently when the device denied
# permission / had GPS off. The clients now block the trigger until they have
# a fix (mobile falls back to last-known; the NFC web page shows a retry
# state) — this is the server-side backstop, so a client that skips that
# check gets a clear 400 instead of an incident nobody can locate. Range
# limits reject nonsense values (a DecimalField alone only checks digits).
class _RequiredLocationFields(serializers.Serializer):
    latitude = serializers.DecimalField(
        max_digits=9, decimal_places=6, min_value=-90, max_value=90,
        error_messages={"required": "Location is required to send help — latitude is missing."},
    )
    longitude = serializers.DecimalField(
        max_digits=9, decimal_places=6, min_value=-180, max_value=180,
        error_messages={"required": "Location is required to send help — longitude is missing."},
    )
    location_accuracy_metres = serializers.FloatField(required=False, allow_null=True)


class SOSTriggerSerializer(_RequiredLocationFields):
    was_offline_queued = serializers.BooleanField(default=False)
    offline_queued_at = serializers.DateTimeField(required=False, allow_null=True)
    priority_level = serializers.ChoiceField(
        choices=["low", "medium", "high", "critical"],
        default="high",
    )


class NFCTriggerSerializer(_RequiredLocationFields):
    # Body of the public POST /nfc/<token>/trigger/ — just the bystander
    # device's location (no patient/incident fields; see NFCTagTriggerView).
    pass


class ConfirmSOSSerializer(serializers.Serializer):
    activation_method = serializers.ChoiceField(
        choices=["manual", "auto", "offline"],
        default="manual",
    )


class CancelIncidentSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, default="", allow_blank=True)


class AcceptIncidentSerializer(serializers.Serializer):
    pass  # No body required; ambulance user is from request.user


class UpdateStatusSerializer(serializers.Serializer):
    STATUS_CHOICES = [
        ("on_the_way", "On the Way"),
        ("arrived_on_scene", "Arrived on Scene"),
        ("completed", "Completed"),
    ]
    status = serializers.ChoiceField(choices=STATUS_CHOICES)


class SelectHospitalSerializer(serializers.Serializer):
    hospital_user_id = serializers.UUIDField()
    eta_minutes = serializers.IntegerField(min_value=1, max_value=300)


class UpdateLocationSerializer(serializers.Serializer):
    ambulance_lat = serializers.FloatField(min_value=-90, max_value=90)
    ambulance_lng = serializers.FloatField(min_value=-180, max_value=180)


# NFC Emergency Tags — MERA admin management

class NFCTagAdminSerializer(serializers.ModelSerializer):
    # Everything a MERA admin needs to manage the physical-inventory
    # lifecycle: the short code to read/type when pairing a tag they're
    # holding, the full public URL to note before writing it to a sticker,
    # and (once paired) which patient it belongs to. Never exposed outside
    # admin-gated endpoints — this is NOT the public status response.
    url = serializers.SerializerMethodField()
    patient_display_name = serializers.SerializerMethodField()
    patient_email = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    class Meta:
        model = NFCTag
        fields = [
            "id", "short_code", "token", "url", "status",
            "patient", "patient_display_name", "patient_email",
            "paired_at", "voided_at", "created_at",
        ]
        read_only_fields = fields

    def get_status(self, obj):
        # "voided" wins over paired/unpaired — a voided tag is dead
        # regardless of whether a patient is still recorded on it.
        if obj.voided_at is not None:
            return "voided"
        return "paired" if obj.patient_id is not None else "unpaired"

    def get_url(self, obj):
        return f"{settings.WEB_FRONTEND_URL}/nfc/{obj.token}"

    def get_patient_display_name(self, obj):
        return obj.patient.get_display_name() if obj.patient else None

    def get_patient_email(self, obj):
        return obj.patient.email if obj.patient else None


class NFCTagGenerateSerializer(serializers.Serializer):
    count = serializers.IntegerField(min_value=1, max_value=200)


class NFCTagPairSerializer(serializers.Serializer):
    short_code = serializers.CharField(max_length=8)
    patient_id = serializers.UUIDField()
