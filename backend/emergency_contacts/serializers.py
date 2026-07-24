from rest_framework import serializers
from .models import EmergencyContact

MAX_CONTACTS = 5


class EmergencyContactSerializer(serializers.ModelSerializer):
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
