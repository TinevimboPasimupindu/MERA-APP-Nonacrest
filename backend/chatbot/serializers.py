from rest_framework import serializers
from .models import ChatbotHistory


class ChatbotMessageSerializer(serializers.Serializer):
    # Incoming request: just the patient's typed message
    message = serializers.CharField(max_length=2000)


class ChatbotHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatbotHistory
        fields = ["message_id", "role", "content", "created_at"]
        read_only_fields = fields