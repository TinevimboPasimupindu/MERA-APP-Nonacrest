import re

from rest_framework import serializers

from accounts.validators import normalize_sa_phone
from .models import EmergencyContact

MAX_CONTACTS = 5


# A contact may live abroad, so a full international number is accepted as
# long as it's plausible E.164; anything local-looking must be a valid SA
# number. Either way what's stored is E.164 — exactly what Twilio is sent
# when an SOS fires, so a number that couldn't be texted is rejected here
# rather than failing silently mid-emergency.
_INTERNATIONAL_RE = re.compile(r"^\+[1-9]\d{7,14}$")
CONTACT_PHONE_MESSAGE = (
    "Enter a valid phone number: a South African number like 082 123 4567, "
    "or an international number starting with + and the country code."
)


def normalize_contact_phone(value: str) -> str:
    cleaned = re.sub(r"[\s\-().]", "", value or "")
    if cleaned.startswith("00"):
        cleaned = "+" + cleaned[2:]
    if cleaned.startswith("+") and not cleaned.startswith("+27"):
        if _INTERNATIONAL_RE.match(cleaned):
            return cleaned
        raise serializers.ValidationError(CONTACT_PHONE_MESSAGE)
    try:
        return normalize_sa_phone(cleaned)
    except serializers.ValidationError:
        raise serializers.ValidationError(CONTACT_PHONE_MESSAGE)


class EmergencyContactSerializer(serializers.ModelSerializer):
    # Declared explicitly so the model's older, stricter-about-spaces regex
    # doesn't reject "082 123 4567" before normalization gets a look at it.
    phone_number = serializers.CharField(max_length=20)

    class Meta:
        model = EmergencyContact
        fields = [
            "id",
            "full_name",
            "relationship",
            "phone_number",
            "priority_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_phone_number(self, value):
        return normalize_contact_phone(value)

    #  Enforce max 5 contacts per patient                          
    
    def validate(self, attrs):
        request = self.context.get("request")
        patient = request.user if request else None

        # Only apply on create (instance is None), not on update
        if self.instance is None and patient is not None:
            existing_count = EmergencyContact.objects.filter(patient=patient).count()
            if existing_count >= MAX_CONTACTS:
                raise serializers.ValidationError(
                    f"A patient may have at most {MAX_CONTACTS} emergency contacts."
                )

        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        validated_data["patient"] = request.user
        return super().create(validated_data)
