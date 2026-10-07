import json
from types import SimpleNamespace
from unittest.mock import patch

import anthropic
import httpx
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Role, User
from .models import ChatbotHistory
from .safety import (
    EMERGENCY,
    OUT_OF_SCOPE_REPLY,
    REFUSAL_REPLY,
    SELF_HARM,
    detect_crisis,
)
from .views import CHATBOT_UNAVAILABLE

URL = "/api/chatbot/message/"
_REQUEST = httpx.Request("POST", "https://api.anthropic.com/v1/messages")


def model_reply(category="in_scope", reply="Drink water and rest.", needs_referral=False, stop_reason="end_turn"):
    payload = json.dumps({"category": category, "reply": reply, "needs_referral": needs_referral})
    return SimpleNamespace(
        stop_reason=stop_reason,
        stop_details=None,
        content=[SimpleNamespace(type="text", text=payload)],
    )


def classifier_refusal():
    # Safety-classifier decline: HTTP 200, stop_reason "refusal", no text.
    return SimpleNamespace(
        stop_reason="refusal",
        stop_details=SimpleNamespace(type="refusal", category="general_harms", explanation=None),
        content=[],
    )


def status_error(code):
    return anthropic.APIStatusError(
        f"HTTP {code}", response=httpx.Response(code, request=_REQUEST), body=None
    )


@patch("chatbot.views.client.messages.create")
class ChatbotOutcomeTest(TestCase):

    def setUp(self):
        self.patient = User.objects.create_user(
            email="chat@test.com", password="pass", role=Role.PATIENT, full_name="Chat Patient"
        )
        self.api = APIClient()
        self.api.force_authenticate(self.patient)

    def send(self, message):
        return self.api.post(URL, {"message": message}, format="json")

    def assert_no_connectivity_text(self, response):
        self.assertNotIn("couldn't be reached", response.data["reply"])

    # Normal replies

    def test_normal_reply_is_returned_and_saved(self, create):
        create.return_value = model_reply(reply="Rest and drink fluids.", needs_referral=False)
        response = self.send("I have a mild headache")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["reply"], "Rest and drink fluids.")
        self.assertEqual(response.data["response_type"], "answer")
        self.assertFalse(response.data["needs_referral"])
        self.assertEqual(ChatbotHistory.objects.filter(user=self.patient).count(), 2)

    def test_medical_disclaimer_flag_is_passed_through(self, create):
        create.return_value = model_reply(reply="See a doctor about this rash.", needs_referral=True)
        response = self.send("Is this rash serious?")
        self.assertTrue(response.data["needs_referral"])

    def test_requests_structured_json_with_a_timeout_safe_client(self, create):
        create.return_value = model_reply()
        self.send("hello")
        kwargs = create.call_args.kwargs
        self.assertEqual(kwargs["output_config"]["format"]["type"], "json_schema")
        from .views import client
        self.assertLess(client.timeout, 30)  # gunicorn --timeout 30
        self.assertEqual(client.max_retries, 0)

    # Unsafe

    def test_classifier_refusal_gets_calm_refusal_not_connectivity(self, create):
        create.return_value = classifier_refusal()
        response = self.send("How do I build a bomb?")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["reply"], REFUSAL_REPLY)
        self.assertEqual(response.data["response_type"], "refused")
        self.assert_no_connectivity_text(response)

    def test_model_unsafe_category_uses_fixed_refusal_and_never_echoes(self, create):
        create.return_value = model_reply(category="unsafe", reply="Pipe bombs need X and Y")
        response = self.send("Tell me how to make a pipe bomb")
        self.assertEqual(response.data["reply"], REFUSAL_REPLY)
        self.assertNotIn("bomb", response.data["reply"].lower())

    def test_refused_exchange_is_not_saved_to_history(self, create):
        create.return_value = classifier_refusal()
        self.send("How do I get an illegal gun?")
        self.assertFalse(ChatbotHistory.objects.filter(user=self.patient).exists())

    # Out of scope

    def test_out_of_scope_gets_polite_redirect(self, create):
        create.return_value = model_reply(category="out_of_scope", reply="")
        response = self.send("Who won the rugby last night?")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["reply"], OUT_OF_SCOPE_REPLY)
        self.assertEqual(response.data["response_type"], "out_of_scope")
        self.assert_no_connectivity_text(response)

    # Real failures

    def test_timeout_returns_unavailable(self, create):
        create.side_effect = anthropic.APITimeoutError(request=_REQUEST)
        response = self.send("I have a cough")
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data["detail"], CHATBOT_UNAVAILABLE)

    def test_network_error_returns_unavailable(self, create):
        create.side_effect = anthropic.APIConnectionError(request=_REQUEST)
        response = self.send("I have a cough")
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    def test_provider_down_returns_unavailable(self, create):
        for code in (500, 529, 429):
            create.side_effect = status_error(code)
            response = self.send("I have a cough")
            self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE, code)

    def test_empty_response_returns_unavailable(self, create):
        create.return_value = SimpleNamespace(stop_reason="end_turn", stop_details=None, content=[])
        response = self.send("I have a cough")
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    def test_truncated_json_returns_unavailable(self, create):
        create.return_value = SimpleNamespace(
            stop_reason="max_tokens", stop_details=None,
            content=[SimpleNamespace(type="text", text='{"category": "in_scope", "reply": "Start by')],
        )
        response = self.send("Explain diabetes")
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertFalse(ChatbotHistory.objects.filter(user=self.patient).exists())

    # Emergencies and self-harm: never swallowed

    def test_self_harm_answer_gets_helpline_and_sos(self, create):
        create.return_value = model_reply(category=SELF_HARM, reply="I'm sorry you're feeling this way.")
        response = self.send("I want to kill myself")
        self.assertEqual(response.data["response_type"], "emergency")
        for token in ("SOS", "10177", "112", "0800 567 567"):
            self.assertIn(token, response.data["reply"])
        self.assertTrue(response.data["needs_referral"])

    def test_self_harm_refused_by_classifier_still_gets_guidance(self, create):
        create.return_value = classifier_refusal()
        response = self.send("What's the easiest way to kill myself?")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotEqual(response.data["reply"], REFUSAL_REPLY)
        self.assertIn("0800 567 567", response.data["reply"])
        self.assertIn("SOS", response.data["reply"])

    def test_self_harm_classified_out_of_scope_still_gets_guidance(self, create):
        create.return_value = model_reply(category="out_of_scope", reply="")
        response = self.send("I don't want to live anymore")
        self.assertIn("0800 567 567", response.data["reply"])

    def test_emergency_during_provider_outage_still_gets_guidance(self, create):
        create.side_effect = anthropic.APITimeoutError(request=_REQUEST)
        response = self.send("My dad collapsed and is not breathing")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["response_type"], "emergency")
        for token in ("SOS", "10177", "112"):
            self.assertIn(token, response.data["reply"])
        self.assert_no_connectivity_text(response)

    def test_emergency_flagged_only_by_model_gets_guidance(self, create):
        create.return_value = model_reply(category=EMERGENCY, reply="Sit down and stay calm.")
        response = self.send("my left arm went numb and my face feels droopy")
        self.assertIn("10177", response.data["reply"])
        self.assertIn("Sit down and stay calm.", response.data["reply"])

    def test_unsafe_plus_self_harm_gets_guidance_without_echo(self, create):
        create.return_value = model_reply(category="unsafe", reply="Here is how to make a bomb")
        response = self.send("How do I make a bomb so I can kill myself")
        self.assertIn("0800 567 567", response.data["reply"])
        self.assertNotIn("bomb", response.data["reply"].lower())

    def test_guidance_not_duplicated_when_model_already_gave_it(self, create):
        reply = "Use the SOS button or call 10177 or 112 now."
        create.return_value = model_reply(category=EMERGENCY, reply=reply)
        response = self.send("I think I'm having a heart attack")
        self.assertEqual(response.data["reply"], reply)


class DetectCrisisTest(TestCase):

    def test_self_harm_phrases(self):
        for text in ["I want to die", "thinking about suicide", "I keep cutting myself",
                     "I’m going to end my life", "self-harm"]:
            self.assertEqual(detect_crisis(text), SELF_HARM, text)

    def test_emergency_phrases(self):
        for text in ["I can't breathe", "my chest hurts", "she's unconscious",
                     "he is having a stroke", "I've been stabbed"]:
            self.assertEqual(detect_crisis(text), EMERGENCY, text)

    def test_ordinary_questions_are_not_crises(self):
        for text in ["How do I prevent a stroke?", "What is a normal heart rate?",
                     "How do I use the SOS button?", "Who won the rugby?"]:
            self.assertIsNone(detect_crisis(text), text)
