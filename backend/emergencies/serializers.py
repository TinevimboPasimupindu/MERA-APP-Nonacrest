from rest_framework import serializers
from .models import EmergencyLog, Incident, IncidentStatus, TreatmentNote

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

    class Meta:
        model = Incident
        fields = [
            "id", "status", "priority_level", "activation_method",
            "latitude", "longitude",
            "triggered_at", "confirmed_at", "accepted_at",
            "arrived_at", "completed_at", "cancelled_at",
            "ambulance_service", "destination_hospital",
            "eta_minutes",
            "was_offline_queued",
            "treatment_note",
            "log_entries",
        ]
        read_only_fields = fields

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

class SOSTriggerSerializer(serializers.Serializer):
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    location_accuracy_metres = serializers.FloatField(required=False, allow_null=True)
    was_offline_queued = serializers.BooleanField(default=False)
    offline_queued_at = serializers.DateTimeField(required=False, allow_null=True)
    priority_level = serializers.ChoiceField(
        choices=["low", "medium", "high", "critical"],
        default="high",
    )


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
