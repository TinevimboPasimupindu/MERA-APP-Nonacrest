import json
import logging

import anthropic
from django.conf import settings
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsPatient
from medical_profiles.models import MedicalProfile
from .models import ChatbotHistory
from .safety import (
    CRISIS_REPLY,
    EMERGENCY,
    OUT_OF_SCOPE_REPLY,
    REFUSAL_REPLY,
    SELF_HARM,
    detect_crisis,
    with_crisis_guidance,
)
from .serializers import ChatbotMessageSerializer, ChatbotHistorySerializer

logger = logging.getLogger(__name__)

# Gunicorn kills a worker after 30s (Procfile --timeout 30). The SDK default
# is a 10-minute timeout with 2 retries, so a slow provider used to end in a
# Render 502 instead of CHATBOT_UNAVAILABLE. One 25s attempt fits inside it.
PROVIDER_TIMEOUT_SECONDS = 25.0
client = anthropic.Anthropic(
    api_key=settings.ANTHROPIC_API_KEY,
    timeout=PROVIDER_TIMEOUT_SECONDS,
    max_retries=0,
)

MODEL = "claude-sonnet-5"
# Shown ONLY for a genuine failure: provider error, timeout, network, or a
# response with no usable text. Never for a refusal or an off-topic question.
CHATBOT_UNAVAILABLE = (
    "The AI assistant couldn't be reached just now, so your message wasn't answered. "
    "Wait a moment and send it again. For anything urgent, use the SOS button or call 10177."
)
HISTORY_LIMIT = 7

# response_type values returned to the app alongside reply/needs_referral.
ANSWER = "answer"
CRISIS = "emergency"
OUT_OF_SCOPE = "out_of_scope"
REFUSED = "refused"

CATEGORIES = ["in_scope", EMERGENCY, SELF_HARM, "out_of_scope", "unsafe"]

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "category": {"type": "string", "enum": CATEGORIES},
        "reply": {"type": "string"},
        "needs_referral": {"type": "boolean"},
    },
    "required": ["category", "reply", "needs_referral"],
    "additionalProperties": False,
}


class ProviderFailure(Exception):
    pass


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

Scope:
- You help with health questions (symptoms, conditions, medication, first aid, mental health, staying well) and with using the MERA app, including its SOS button.
- You do not help with anything unrelated to health or MERA.
- How MERA's SOS works: on the home screen, press and hold the red SOS button for about 1.5 seconds. MERA sends the patient's location to nearby ambulance services and texts their emergency contacts, and the patient can follow the ambulance or cancel from the emergency screen. Don't describe app features beyond this.

Guidelines:
- Give clear, general health information, and take the patient's conditions, medications, and allergies into account when relevant and available.
- You are not a doctor and must never provide a diagnosis or prescribe treatment.
- If the question involves symptoms that could indicate something serious, or asks for a diagnosis or prescription, answer helpfully but clearly recommend the patient consult a healthcare professional or hospital.
- If the patient may be in an emergency right now, or mentions suicide or self-harm, respond calmly and supportively and tell them to use the SOS button on their MERA home screen or call 10177 (ambulance) or 112 from a mobile phone. For suicide or self-harm, also give the SADAG Suicide Crisis Helpline, 0800 567 567 (24 hours).
- Keep responses concise and easy to read on a mobile screen.

Set "category" to exactly one of:
- "in_scope": a health or MERA question you are answering.
- "emergency": the patient describes what may be a medical emergency happening now (for example chest pain, trouble breathing, severe bleeding, unconsciousness, signs of a stroke, an overdose, or being attacked).
- "self_harm": the message mentions suicide, self-harm, or wanting to die.
- "out_of_scope": not about health or MERA. Leave "reply" empty.
- "unsafe": asks for help with weapons, explosives, violence, or harming others. Leave "reply" empty.

Set needs_referral to true if your response touches on diagnosis, prescribing treatment, or symptoms that warrant professional medical attention. Otherwise set it to false."""


def call_provider(system_prompt, messages):
    # Returns (stop_reason, text). Raises ProviderFailure for anything that
    # means the assistant genuinely couldn't answer.
    try:
        api_response = client.messages.create(
            model=MODEL,
            max_tokens=1000,
            system=system_prompt,
            messages=messages,
            output_config={"format": {"type": "json_schema", "schema": RESPONSE_SCHEMA}},
        )
    except anthropic.APIConnectionError as exc:  # includes APITimeoutError
        logger.warning("Chatbot provider unreachable: %r", exc)
        raise ProviderFailure from exc
    except anthropic.APIStatusError as exc:
        # 429/5xx/529 are provider-side; other 4xx mean our own request or
        # configuration is wrong. Either way the user can only retry later.
        log = logger.warning if exc.status_code == 429 or exc.status_code >= 500 else logger.error
        log("Chatbot provider returned HTTP %s: %r", exc.status_code, exc)
        raise ProviderFailure from exc

    if api_response.stop_reason == "refusal":
        # HTTP 200 from a safety classifier, often with no text block at
        # all. This used to fall into the generic except and show the
        # connectivity message.
        details = getattr(api_response, "stop_details", None)
        logger.info("Chatbot request declined by provider safeguards (category %s)",
                    getattr(details, "category", None))
        return "refusal", None

    text = next((b.text for b in api_response.content if b.type == "text"), None)
    if not text or not text.strip():
        logger.error("Chatbot provider returned no text (stop_reason %s)", api_response.stop_reason)
        raise ProviderFailure
    return api_response.stop_reason, text


def parse_reply(raw_text):
    # Returns (category, reply, needs_referral). Structured outputs should
    # always give valid JSON; the fence-stripping and plain-prose fallbacks
    # are kept for safety. Truncated or garbled JSON is a failure, not a reply.
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        if cleaned.startswith("{"):
            logger.error("Chatbot JSON unparseable (likely truncated)")
            raise ProviderFailure
        return "in_scope", raw_text, False

    if not isinstance(parsed, dict):
        raise ProviderFailure
    category = parsed.get("category") if parsed.get("category") in CATEGORIES else "in_scope"
    return category, str(parsed.get("reply") or ""), bool(parsed.get("needs_referral", False))


def resolve_outcome(user_message, provider_result):
    # provider_result is (category, reply, needs_referral), "refusal", or
    # "failure". Returns (response_type, reply, needs_referral, persist), or
    # None for a real failure with no crisis signal (the caller sends 503).
    #
    # The crisis check comes before every other outcome, so a refusal, an
    # off-topic classification or a provider outage can never swallow the
    # emergency guidance.
    crisis = detect_crisis(user_message)

    if isinstance(provider_result, tuple):
        category, reply, needs_referral = provider_result
        if crisis is None and category in (EMERGENCY, SELF_HARM):
            crisis = category
    else:
        category, reply, needs_referral = None, "", False

    if crisis:
        if category in ("in_scope", EMERGENCY, SELF_HARM) and reply.strip():
            return CRISIS, with_crisis_guidance(reply, crisis), True, True
        return CRISIS, CRISIS_REPLY[crisis], True, True

    if provider_result == "failure":
        return None
    if provider_result == "refusal" or category == "unsafe":
        # Not persisted: replaying the request as history on later turns
        # could get unrelated follow-up questions declined too.
        return REFUSED, REFUSAL_REPLY, False, False
    if category == "out_of_scope":
        return OUT_OF_SCOPE, OUT_OF_SCOPE_REPLY, False, True
    if not reply.strip():
        return None
    return ANSWER, reply, needs_referral, True


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

    # 4. Call Claude and classify what came back
    try:
        stop_reason, raw_text = call_provider(system_prompt, messages)
        provider_result = "refusal" if stop_reason == "refusal" else parse_reply(raw_text)
    except ProviderFailure:
        provider_result = "failure"

    outcome = resolve_outcome(user_message, provider_result)
    if outcome is None:
        return Response(
            # "detail" is what the app's error handling reads; "error" is
            # kept for any existing caller.
            {
                "error": CHATBOT_UNAVAILABLE,
                "detail": CHATBOT_UNAVAILABLE,
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    response_type, reply_text, needs_referral, persist = outcome

    # 5. Save both messages to history
    if persist:
        ChatbotHistory.objects.create(user=request.user, role="user", content=user_message)
        ChatbotHistory.objects.create(user=request.user, role="assistant", content=reply_text)

    # 6. Return to frontend
    return Response({
        "reply": reply_text,
        "needs_referral": needs_referral,
        "response_type": response_type,
    })


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated, IsPatient])
def chatbot_history(request):
    history = ChatbotHistory.objects.filter(user=request.user).order_by("created_at")
    return Response(ChatbotHistorySerializer(history, many=True).data)
