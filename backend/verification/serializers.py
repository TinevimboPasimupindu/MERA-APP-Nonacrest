from rest_framework import serializers
from accounts.models import HOSPITAL_ROLES, User
from .models import VerificationRequest, VerificationRequestStatus


class VerificationRequestSerializer(serializers.ModelSerializer):
    # Patient-facing: shows their current request and status.

    urgency_badge = serializers.CharField(read_only=True)
    hospital_name = serializers.SerializerMethodField()
    hospital_address = serializers.SerializerMethodField()
    hospital_visiting_hours = serializers.SerializerMethodField()

    class Meta:
        model = VerificationRequest
        fields = [
            "id", "status", "hospital_name", "hospital_address",
            "hospital_visiting_hours", "hospital_note",
            "urgency_badge", "submitted_at", "reviewed_at",
        ]
        read_only_fields = fields

    def get_hospital_name(self, obj):
        return obj.hospital.facility_name

    def get_hospital_address(self, obj):
        return obj.hospital.official_address

    def get_hospital_visiting_hours(self, obj):
        return obj.hospital.visiting_hours


class SubmitVerificationRequestSerializer(serializers.Serializer):
    hospital_id = serializers.UUIDField()

    def validate_hospital_id(self, value):
        try:
            hospital = User.objects.get(
                id=value,
                role__in=HOSPITAL_ROLES,
                is_active=True,
                institutional_status="approved",
            )
        except User.DoesNotExist:
            raise serializers.ValidationError(
                "Hospital not found or not yet approved on MERA."
            )
        self._hospital = hospital
        return value

    def save(self, patient):
        from django.utils import timezone
        from medical_profiles.models import VerificationStatus

        # Mark any previous pending requests for this patient as withdrawn
        VerificationRequest.objects.filter(
            patient=patient,
            status__in=[
                VerificationRequestStatus.PENDING,
                VerificationRequestStatus.INFO_REQUESTED,
            ],
        ).update(status=VerificationRequestStatus.WITHDRAWN)

        request = VerificationRequest.objects.create(
            patient=patient,
            hospital=self._hospital,
            status=VerificationRequestStatus.PENDING,
            submitted_at=timezone.now(),
        )

        # Update the medical profile's verification status to Pending
        profile = patient.medical_profile
        profile.verification_status = VerificationStatus.PENDING
        profile.save(update_fields=["verification_status", "updated_at"])

        return request


class HospitalQueueSerializer(serializers.ModelSerializer):
    urgency_badge = serializers.CharField(read_only=True)
    patient_name = serializers.SerializerMethodField()
    patient_id = serializers.SerializerMethodField()
    patient_age = serializers.SerializerMethodField()  # placeholder — DOB not in scope
    hours_since_submission = serializers.FloatField(read_only=True)

    class Meta:
        model = VerificationRequest
        fields = [
            "id", "status", "urgency_badge",
            "patient_name", "patient_id", "patient_age",
            "submitted_at", "hours_since_submission",
        ]
        read_only_fields = fields

    def get_patient_name(self, obj):
        return obj.patient.get_full_name()

    def get_patient_age(self, obj):
        return None  # DOB out of scope — can be added later
    
    def get_patient_id(self, obj):
        return str(obj.patient.id)


class HospitalVerificationActionSerializer(serializers.Serializer):
    ACTION_CHOICES = ["approve", "flag", "request_info"]
    action = serializers.ChoiceField(choices=ACTION_CHOICES)
    note = serializers.CharField(
        required=False, allow_blank=True, default="",
        help_text="Required when action is 'flag' or 'request_info'.",
    )

    def validate(self, data):
        if data["action"] in ("flag", "request_info") and not data.get("note", "").strip():
            raise serializers.ValidationError(
                {"note": "A note is required when flagging or requesting more information."}
            )
        return data
