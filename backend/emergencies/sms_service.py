"""
SMS delivery to a patient's emergency contacts, via Twilio's REST API.

Same defensive shape as the Brevo email call in accounts/views.py and the
Routes call in services.get_route(): plain httpx over HTTPS with an explicit
timeout, no vendor SDK. Unlike those two, nothing here ever raises to the
caller — an SMS is a courtesy notification layered on top of an emergency
flow, and a Twilio outage, a bad phone number or missing credentials must
never block the incident action (confirm / cancel / hospital selection)
that triggered it. Failures are logged and reported through return values.
"""
import logging
import re
import time

import httpx
from django.conf import settings

logger = logging.getLogger(__name__)

TWILIO_MESSAGES_URL = "https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"

# Per Twilio request. A patient can have up to 5 contacts and the
# cancel/hospital messages are sent inside the request that triggered them
# (gunicorn kills a worker at --timeout 30), so the per-call timeout and the
# overall budget below are sized so the worst case still finishes well
# inside that.
TWILIO_TIMEOUT_SECONDS = 5.0
NOTIFY_TOTAL_BUDGET_SECONDS = 20.0

# One of Twilio's fixed trial-account template bodies (sms_2fa,
# sms_appointment_reminders, sms_order_confirmation, sms_delivery_updates,
# sms_customer_support, sms_marketing_promotions, sms_event_notifications,
# sms_account_alerts, sms_feedback_surveys, sms_internal_alerts) — only used
# when settings.TWILIO_TRIAL_MODE is on.
TWILIO_TRIAL_TEMPLATE = "sms_account_alerts"

_E164_RE =re.compile(r"^\+\d{8,15}$")


def normalize_phone_number(raw) -> str | None:
    # EmergencyContact.phone_number's validator accepts local-format numbers
    # ("0821234567") as well as international ones, but Twilio requires
    # E.164 ("+27821234567"). Normalizes here — at send time — rather than
    # touching what the validator accepts or what's already stored.
    # Returns None for anything that can't be made into a plausible E.164.
    if not raw:
        return None
    default_cc = settings.SMS_DEFAULT_COUNTRY_CODE  # e.g. "+27"
    cleaned = re.sub(r"[\s\-().]", "", str(raw))

    if cleaned.startswith("+"):
        candidate = cleaned
    elif cleaned.startswith("00"):
        candidate = "+" + cleaned[2:]
    elif cleaned.startswith("0"):
        candidate = default_cc + cleaned[1:]
    elif cleaned.startswith(default_cc.lstrip("+")):
        # Bare digits already carrying the country code ("27821234567").
        candidate = "+" + cleaned
    else:
        candidate = default_cc + cleaned

    return candidate if _E164_RE.match(candidate) else None


def _mask(number: str) -> str:
    # Phone numbers are personal data (POPI) — logs only ever carry the tail.
    return "***" + number[-4:]


def send_sms(to: str, body: str) -> bool:
    # True if Twilio accepted the message, False on any failure. Never raises.
    sid = settings.TWILIO_ACCOUNT_SID
    token = settings.TWILIO_AUTH_TOKEN
    from_number = settings.TWILIO_FROM_NUMBER
    if not (sid and token and from_number):
        logger.warning("SMS not sent: Twilio is not configured (TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER).")
        return False

    to_e164 = normalize_phone_number(to)
    if to_e164 is None:
        logger.warning("SMS not sent: could not normalize phone number %r to E.164.", _mask(str(to)))
        return False

    if settings.TWILIO_TRIAL_MODE:
        # Trial accounts reject custom text to international numbers
        # (Twilio error 572006) — see settings.TWILIO_TRIAL_MODE. Any of
        # Twilio's fixed trial templates works; content isn't under test.
        logger.info("TWILIO_TRIAL_MODE on: sending template %r instead of the real message body.", TWILIO_TRIAL_TEMPLATE)
        body = TWILIO_TRIAL_TEMPLATE

    try:
        response = httpx.post(
            TWILIO_MESSAGES_URL.format(sid=sid),
            data={"To": to_e164, "From": from_number, "Body": body},
            auth=(sid, token),
            timeout=TWILIO_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        # Twilio's error body names the actual reason (unverified trial
        # number, invalid From, unreachable destination, ...) — the status
        # code alone doesn't, so log the body here, where it's in scope.
        logger.error(
            "Twilio rejected SMS to %s: %s — response body: %s",
            _mask(to_e164), exc.response.status_code, exc.response.text,
        )
        return False
    except Exception as exc:  # noqa: BLE001 — timeouts, network errors, anything: never break the caller
        logger.error("Twilio SMS to %s failed: %r", _mask(to_e164), exc)
        return False

    logger.info("SMS sent to %s.", _mask(to_e164))
    return True


def notify_emergency_contacts(patient, body: str) -> int:
    # Sends `body` to every EmergencyContact on `patient` (the related model
    # in emergency_contacts/, reached via User.emergency_contacts — not a
    # MedicalProfile field). Returns how many messages Twilio accepted. One
    # contact failing never stops the rest.
    started = time.monotonic()
    sent = 0
    for contact in patient.emergency_contacts.all():
        if time.monotonic() - started > NOTIFY_TOTAL_BUDGET_SECONDS:
            logger.error("SMS budget exhausted for patient %s; remaining contacts skipped.", patient.id)
            break
        if send_sms(contact.phone_number, body):
            sent += 1
    return sent
