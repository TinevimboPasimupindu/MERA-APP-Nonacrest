from rest_framework import serializers
from .models import MedicalProfile, VerificationStatus


class MedicalProfileSerializer(serializers.ModelSerializer):
    sos_unlocked = serializers.BooleanField(read_only=True)
    is_verified = serializers.BooleanField(read_only=True)

    class Meta:
        model = MedicalProfile
        fields = [
            "id",
            "blood_type",
            "chronic_conditions",
            "current_medications",
            "known_allergies",
            "paramedic_notes",
            "verification_status",
            "verified_at",
            "verified_by",
            "data_sharing_consent",
            "consent_given_at",
            "consent_withdrawn_at",
            "ai_chatbot_consent",
            "ai_chatbot_consent_given_at",
            "ai_chatbot_consent_withdrawn_at",
            "last_updated_by",
            "last_updated_at",
            "sos_unlocked",
            "is_verified",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id", "verification_status", "verified_at", "verified_by",
            "last_updated_by", "last_updated_at",
            "sos_unlocked", "is_verified",
            "consent_given_at", "consent_withdrawn_at",
            "ai_chatbot_consent", "ai_chatbot_consent_given_at", "ai_chatbot_consent_withdrawn_at",
            "created_at", "updated_at",
        ]


class MedicalIntakeFormSerializer(serializers.ModelSerializer):
    data_sharing_consent = serializers.BooleanField()

    class Meta:
        model = MedicalProfile
        fields = [
            "blood_type",
            "chronic_conditions",
            "current_medications",
            "known_allergies",
            "paramedic_notes",
            "data_sharing_consent",
        ]

    def validate_data_sharing_consent(self, value):
        if not value:
            raise serializers.ValidationError(
                "Data sharing consent is required to submit your medical profile."
            )
        return value

    def update(self, instance, validated_data):
        consent = validated_data.pop("data_sharing_consent", None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()

        if consent:
            instance.grant_consent()

        # Patient update always resets status to Pending
        instance.submit_by_patient()
        return instance


class HospitalProfileUpdateSerializer(serializers.ModelSerializer):
    # Hospital updates a verified patient's profile.
    # Does NOT reset verification status.

    class Meta:
        model = MedicalProfile
        fields = [
            "blood_type",
            "chronic_conditions",
            "current_medications",
            "known_allergies",
            "paramedic_notes",
        ]

    def update(self, instance, validated_data):
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        # Record who updated without resetting verification
        instance.update_by_hospital(self.context["request"].user)
        return instance


class ConsentSerializer(serializers.Serializer):
    #Toggle data sharing consent.
    consent = serializers.BooleanField()


class AmbulanceMedicalSummarySerializer(serializers.ModelSerializer):
    patient_full_name = serializers.SerializerMethodField()
    patient_phone = serializers.SerializerMethodField()

    class Meta:
        model = MedicalProfile
        fields = [
            "patient_full_name",
            "patient_phone",
            "blood_type",
            "chronic_conditions",
            "current_medications",
            "known_allergies",
            "paramedic_notes",
            "verification_status",
            "verified_at",
        ]
        read_only_fields = fields

    def get_patient_full_name(self, obj):
        return obj.patient.get_full_name()

    def get_patient_phone(self, obj):
        return obj.patient.phone_number
