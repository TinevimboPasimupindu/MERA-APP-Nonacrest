import json
import anthropic
from django.conf import settings
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsPatient
from medical_profiles.models import MedicalProfile
from .models import ChatbotHistory
from .serializers import ChatbotMessageSerializer, ChatbotHistorySerializer

client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

MODEL = "claude-sonnet-5"
HISTORY_LIMIT = 7


def build_system_prompt(profile):
    context_lines = []

    if profile and profile.ai_chatbot_consent:
        if profile.blood_type and profile.blood_type != "unknown":
            context_lines.append(f"- Blood type: {profile.blood_type}")
        if profile.chronic_conditions:
            context_lines.append(f"- Known conditions: {profile.chronic_conditions}")
        if profile.current_medications:
            context_lines.append(f"- Current medications: {profile.current_medications}")
        if profile.known_allergies:
            context_lines.append(f"- Known allergies: {profile.known_allergies}")

    context_block = "\n".join(context_lines) if context_lines else "No medical profile context available for this conversation."

    return f"""You are the MERA Assistant, a health information chatbot inside a South African medical emergency app.

Patient context:
{context_block}

Guidelines:
- Give clear, general health information, and take the patient's conditions, medications, and allergies into account when relevant and available.
- You are not a doctor and must never provide a diagnosis or prescribe treatment.
- If the question involves symptoms that could indicate something serious, or asks for a diagnosis or prescription, answer helpfully but clearly recommend the patient consult a healthcare professional or hospital.
- Keep responses concise and easy to read on a mobile screen.

Respond ONLY with a JSON object in this exact format, with no other text before or after it:

{{
  "reply": "your response text here",
  "needs_referral": true or false
}}

Set needs_referral to true if your response touches on diagnosis, prescribing treatment, or symptoms that warrant professional medical attention. Otherwise set it to false."""


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated, IsPatient])
def chatbot_message(request):
    serializer = ChatbotMessageSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user_message = serializer.validated_data["message"]

    # 1. Fetch medical profile (may not exist yet)
    profile = MedicalProfile.objects.filter(patient=request.user).first()

    # 2. Fetch last N messages for context, chronological order
    recent = ChatbotHistory.objects.filter(user=request.user).order_by("-created_at")[:HISTORY_LIMIT]
    recent = list(reversed(recent))

    messages = [{"role": msg.role, "content": msg.content} for msg in recent]
    messages.append({"role": "user", "content": user_message})

    # 3. Build system prompt (respects ai_chatbot_consent)
    system_prompt = build_system_prompt(profile)

    # 4. Call Claude
    try:
        api_response = client.messages.create(
            model=MODEL,
            max_tokens=1000,
            system=system_prompt,
            messages=messages,
        )
        raw_text = None
        for block in api_response.content:
            if block.type == "text":
                raw_text = block.text
                break

        if raw_text is None:
            raise ValueError("No text block found in Claude's response")
        
    except Exception as e:
        print("CHATBOT API ERROR:", repr(e))
        return Response(
            {"error": "The chatbot is currently unavailable. Please try again shortly."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    # 5. Parse structured JSON response, with fallback
    cleaned_text = raw_text.strip()
    if cleaned_text.startswith("```"):
        # Strip markdown code fences (```json ... ``` or ``` ... ```)
        cleaned_text = cleaned_text.strip("`")
        if cleaned_text.startswith("json"):
            cleaned_text = cleaned_text[4:]
        cleaned_text = cleaned_text.strip()

    try:
        parsed = json.loads(cleaned_text)
        reply_text = parsed.get("reply", raw_text)
        needs_referral = parsed.get("needs_referral", False)
    except json.JSONDecodeError:
        print("CHATBOT JSON PARSE FAILED. Raw text was:", repr(raw_text))
        reply_text = raw_text
        needs_referral = False

    # 6. Save both messages to history
    ChatbotHistory.objects.create(user=request.user, role="user", content=user_message)
    ChatbotHistory.objects.create(user=request.user, role="assistant", content=reply_text)

    # 7. Return to frontend
    return Response({
        "reply": reply_text,
        "needs_referral": needs_referral,
    })


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated, IsPatient])
def chatbot_history(request):
    history = ChatbotHistory.objects.filter(user=request.user).order_by("created_at")
    return Response(ChatbotHistorySerializer(history, many=True).data)
