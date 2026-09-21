"""
Emergency services — prototype version.
Push notifications are replaced with logger.info stubs (no notifications app
needed); SMS to a patient's emergency contacts is real (Twilio — sms_service.py).
WebSocket broadcast is a no-op (no Channels/Redis needed).
"""
import logging
import threading

import httpx
from django.conf import settings
from django.db import close_old_connections, transaction
from django.utils import timezone

from . import sms_service
from .models import (
    ActivationMethod,
    EmergencyLog,
    Incident,
    IncidentStatus,
    TreatmentNote,
)

logger = logging.getLogger(__name__)

GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"


def _log(incident, event_type, description="", actor=None, lat=None, lng=None):
    return EmergencyLog.objects.create(
        incident=incident,
        event_type=event_type,
        description=description,
        actor=actor,
        latitude=lat or incident.latitude,
        longitude=lng or incident.longitude,
    )


def _broadcast_ws(group_name: str, payload: dict) -> None:
    """No-op — WebSockets require Channels + Redis (not needed for prototype)."""
    logger.debug("WS broadcast (stub) → %s : %s", group_name, payload)


def _notify(msg: str, *args) -> None:
    """Stub for SMS/push — logs to console instead of sending."""
    logger.info("[NOTIFY STUB] " + msg, *args)


# Emergency-contact SMS (Twilio — see sms_service.py)

def _sms_emergency_contacts(patient, body: str) -> int:
    # Every SMS to contacts goes through here so a notification failure of
    # any kind (Twilio down, DB hiccup reading contacts, ...) is logged and
    # swallowed — it must never block or roll back the incident action that
    # triggered it, same rule as the OTP email path.
    try:
        return sms_service.notify_emergency_contacts(patient, body)
    except Exception:  # noqa: BLE001
        logger.exception("Emergency-contact SMS failed for patient %s.", patient.id)
        return 0


def _send_contact_alert(incident_id) -> None:
    # The body of the delayed initial alert. Takes an id, not an Incident,
    # and re-fetches: this runs seconds after confirm_sos() on a different
    # thread, and the patient may well have cancelled in between — an
    # in-memory Incident from before the delay would still say ACTIVE.
    try:
        incident = Incident.objects.select_related("patient").get(pk=incident_id)
    except Incident.DoesNotExist:
        logger.warning("Contact alert skipped: incident %s no longer exists.", incident_id)
        return

    if incident.status == IncidentStatus.CANCELLED:
        logger.info("Contact alert skipped: incident %s was cancelled before the alert went out.", incident.id)
        return
    if incident.emergency_contact_alert_sent_at is not None:
        return

    name = incident.patient.get_full_name()
    if incident.latitude is not None and incident.longitude is not None:
        where = f"Location: https://www.google.com/maps?q={incident.latitude},{incident.longitude}"
    else:
        # The patient can decline the location permission; the app then
        # sends null coordinates.
        where = "Location unavailable."
    sent = _sms_emergency_contacts(
        incident.patient, f"{name} has triggered a medical emergency via MERA. {where}"
    )

    # Only mark contacts as told if at least one message really went out —
    # cancel_incident() keys the follow-up "cancelled" notice off this, and
    # retracting an alert nobody received would just be confusing.
    if sent:
        incident.emergency_contact_alert_sent_at = timezone.now()
        incident.save(update_fields=["emergency_contact_alert_sent_at", "updated_at"])


def _contact_alert_thread_entry(incident_id) -> None:
    # threading.Timer target. Runs outside any request, so Django's
    # request-end connection cleanup never happens for this thread's DB
    # connection — close it explicitly on the way in and out or it leaks.
    close_old_connections()
    try:
        _send_contact_alert(incident_id)
    except Exception:  # noqa: BLE001
        logger.exception("Contact alert failed for incident %s.", incident_id)
    finally:
        close_old_connections()


def _schedule_contact_alert(incident_id) -> None:
    # In-process timer, deliberately no Celery/Redis (see settings.py's note
    # on what was removed for the prototype). Consequence worth knowing: a
    # worker restart/deploy inside the delay window silently drops the alert.
    delay = settings.SOS_ALERT_DELAY_SECONDS
    if delay <= 0:
        # No delay configured (the test-run default): run inline, no thread.
        try:
            _send_contact_alert(incident_id)
        except Exception:  # noqa: BLE001
            logger.exception("Contact alert failed for incident %s.", incident_id)
        return
    timer = threading.Timer(delay, _contact_alert_thread_entry, args=(incident_id,))
    timer.daemon = True  # never hold up interpreter shutdown for a pending alert
    timer.start()


# SOS Trigger

# Non-terminal = everything except COMPLETED/CANCELLED — same definition
# IncidentViewSet.my_active() already uses (exclude() rather than an
# include-list, so a future new intermediate status is automatically
# covered here too without this needing a matching update).
_NON_TERMINAL_EXCLUDE = [IncidentStatus.COMPLETED, IncidentStatus.CANCELLED]


def trigger_sos(patient_user, validated_data: dict) -> tuple[Incident, bool]:
    # Returns (incident, created) — the same shape as Django's own
    # get_or_create(), which is exactly what this is doing conceptually:
    # get the patient's existing non-terminal incident if there is one,
    # otherwise create a new one.
    #
    # Duplicate-prevention, not just an abuse/rate concern: an accidental
    # double-tap on the SOS button is a real, expected scenario for a
    # patient under stress (shaky hands, a slow UI response tempting a
    # second tap, a flaky connection retrying client-side) — a rate limit
    # alone wouldn't stop this, since a double-tap a second apart is well
    # within any generous per-minute ceiling. Creating two Incidents for
    # the same emergency would be a real correctness bug regardless of
    # intent: two ambulances could get dispatched to the same patient, and
    # emergency contacts would be notified twice for one event. Checked
    # BEFORE the verification gate below on purpose — a patient who
    # already has a live incident should get it back regardless of
    # whether their profile is *currently* verified (verification status
    # could theoretically change between the first trigger and a retry;
    # that shouldn't orphan them from their own already-triggered incident).
    existing = (
        Incident.objects.filter(patient=patient_user)
        .exclude(status__in=_NON_TERMINAL_EXCLUDE)
        .order_by("-triggered_at")
        .first()
    )
    if existing:
        return existing, False

    if not _patient_is_verified(patient_user):
        raise PermissionError("SOS is locked until your medical profile is verified.")

    with transaction.atomic():
        incident = Incident.objects.create(
            patient=patient_user,
            latitude=validated_data.get("latitude"),
            longitude=validated_data.get("longitude"),
            location_accuracy_metres=validated_data.get("location_accuracy_metres"),
            priority_level=validated_data.get("priority_level", "high"),
            was_offline_queued=validated_data.get("was_offline_queued", False),
            offline_queued_at=validated_data.get("offline_queued_at"),
            status=IncidentStatus.PENDING_CONFIRMATION,
        )
        _log(incident, "sos_triggered", actor=patient_user)

    logger.info("SOS triggered — Incident %s for patient %s", incident.id, patient_user.id)
    return incident, True


def confirm_sos(incident: Incident, method: str = ActivationMethod.MANUAL) -> Incident:
    if incident.status != IncidentStatus.PENDING_CONFIRMATION:
        raise ValueError(f"Cannot confirm incident in status '{incident.status}'.")

    with transaction.atomic():
        incident.confirm(method=method)
        event = "sos_auto_confirmed" if method == ActivationMethod.AUTO else "sos_confirmed"
        _log(incident, event, actor=incident.patient)

    # Started from confirmation, not from trigger_sos(): an incident that was
    # triggered but never confirmed never goes live, so contacts shouldn't be
    # told about it. The status-is-not-CANCELLED check happens when the
    # timer fires, in _send_contact_alert().
    _schedule_contact_alert(incident.id)
    _notify("Nearby ambulance services would be push-notified (Incident %s).", incident.id)

    logger.info("SOS confirmed (%s) — Incident %s", method, incident.id)
    return incident


def cancel_incident(incident: Incident, cancelled_by, reason: str = "") -> Incident:
    # Product decision: cancellation stays available through DISPATCHED and
    # ON_THE_WAY (an ambulance can already be assigned/en route) — only once
    # the crew is physically ARRIVED_ON_SCENE does the situation stop being
    # something the patient can unilaterally call off; from that point on,
    # only the crew on scene can assess and resolve it. Before ARRIVED_ON_
    # SCENE, cancelling still saves resources on a false alarm.
    cancellable = {
        IncidentStatus.PENDING_CONFIRMATION,
        IncidentStatus.ACTIVE,
        IncidentStatus.DISPATCHED,
        IncidentStatus.ON_THE_WAY,
    }
    if incident.status not in cancellable:
        raise ValueError(f"Cannot cancel an incident in status '{incident.status}'.")

    with transaction.atomic():
        incident.cancel(cancelled_by_user=cancelled_by, reason=reason)
        _log(incident, "sos_cancelled", description=reason, actor=cancelled_by)

    # Contacts only get a cancellation notice if they were actually told
    # about the emergency. Not yet told (still inside the alert delay) means
    # nothing to retract — the pending timer sees CANCELLED and sends
    # nothing. Read from the DB, not `incident`: the timer thread may have
    # set this after this request loaded the object.
    alert_sent_at = (
        Incident.objects.filter(pk=incident.pk)
        .values_list("emergency_contact_alert_sent_at", flat=True)
        .first()
    )
    if alert_sent_at is not None:
        _sms_emergency_contacts(
            incident.patient,
            f"{incident.patient.get_full_name()}'s MERA emergency alert has been cancelled.",
        )

    # Only DISPATCHED/ON_THE_WAY cancellations have an ambulance assigned
    # yet to notify — the pre-dispatch statuses above never had one. The
    # ambulance/EMT actually already viewing this incident (active-response.
    # tsx) learns of it for real within one ~12s location-send tick, since
    # that PATCH's response already carries the incident's current status
    # and that screen already treats a cancelled/completed status as "stop
    # and alert the EMT" — this stub is just this transition's equivalent
    # of the push-notification stubs every other transition point logs.
    if incident.ambulance_service_id:
        _notify("Ambulance %s would be push-notified that the patient cancelled.", incident.ambulance_service_id)

    return incident


def accept_incident(incident: Incident, ambulance_service, actor) -> Incident:
    # `ambulance_service` is the institution account the incident should be
    # attributed to — resolved by the caller via User.effective_ambulance_service,
    # so it's the EMT's ambulance_admin when an EMT accepts, not the EMT
    # themselves. `actor` is the real user who performed the accept (may be
    # that same EMT) and is what gets recorded on the audit log.
    with transaction.atomic():
        locked = Incident.objects.select_for_update().get(pk=incident.pk)
        if locked.status != IncidentStatus.ACTIVE:
            raise ValueError("This alert has already been accepted or is no longer active.")
        locked.accept(ambulance_user=ambulance_service)
        _log(locked, "ambulance_accepted", actor=actor)

    _notify("Patient %s would be push-notified that ambulance accepted.", locked.patient_id)
    logger.info(
        "Incident %s accepted by ambulance %s (actor %s)",
        locked.id, ambulance_service.id, actor.id,
    )
    return locked


def select_destination_hospital(incident: Incident, hospital_user, eta_minutes: int) -> Incident:
    incident.destination_hospital = hospital_user
    incident.eta_minutes = eta_minutes
    incident.save(update_fields=["destination_hospital", "eta_minutes", "updated_at"])
    _log(incident, "hospital_notified", description=f"ETA: {eta_minutes} min")
    _notify("Hospital %s would be push-notified (ETA %d min).", hospital_user.id, eta_minutes)
    # Always sent — deliberately no check against whether the initial alert
    # has gone out yet; in a fast dispatch contacts may see both messages
    # arrive close together, and the initial one still explains the context.
    _sms_emergency_contacts(
        incident.patient,
        f"{incident.patient.get_full_name()} is being taken to {hospital_user.get_full_name()} by ambulance.",
    )
    return incident


def update_ambulance_location(incident: Incident, lat: float, lng: float) -> Incident:
    # Live GPS ping from the responding EMT/ambulance — expected to arrive
    # frequently (every few seconds) while en route, so deliberately NOT
    # written to EmergencyLog the way accept/status-change events are;
    # that log is for meaningful state transitions, and logging every ping
    # would spam it. incident.updated_at still moves, which is enough for
    # anything that just needs "was this incident touched recently."
    incident.ambulance_lat = lat
    incident.ambulance_lng = lng
    incident.save(update_fields=["ambulance_lat", "ambulance_lng", "updated_at"])
    return incident


def get_route(origin_lat: float, origin_lng: float, dest_lat: float, dest_lng: float) -> dict:
    # Server-side-only call to Google's Routes API (computeRoutes). The API
    # key never leaves the backend — see GOOGLE_MAPS_API_KEY in settings.py,
    # same pattern as ANTHROPIC_API_KEY for the chatbot.
    #
    # X-Goog-FieldMask deliberately requests ONLY Basic-tier fields
    # (duration, distanceMeters, polyline). Adding traffic-aware fields
    # (e.g. routeTravelAdvisory) or advanced routing options would bump
    # this call into Google's more expensive Advanced tier — don't add
    # fields here without checking which pricing tier they fall under.
    #
    # Raises RuntimeError on any failure (missing key, no route found) or
    # propagates httpx's own exceptions (network error, non-2xx response);
    # callers are expected to catch broadly and turn this into a 503,
    # mirroring chatbot/views.py's handling of Anthropic API failures.
    api_key = settings.GOOGLE_MAPS_API_KEY
    if not api_key:
        raise RuntimeError("GOOGLE_MAPS_API_KEY is not configured.")

    payload = {
        "origin": {"location": {"latLng": {"latitude": origin_lat, "longitude": origin_lng}}},
        "destination": {"location": {"latLng": {"latitude": dest_lat, "longitude": dest_lng}}},
        "travelMode": "DRIVE",
    }
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
    }

    response = httpx.post(GOOGLE_ROUTES_URL, json=payload, headers=headers, timeout=10.0)
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError:
        # Google's error responses are JSON with a detailed "error" object
        # (reason, message — e.g. "API not enabled", "billing not enabled",
        # "API key not valid", quota exceeded, etc.). The status code alone
        # (all the view's broad except currently logs, via %r on the
        # exception) doesn't say which of those it is — log the full body
        # here, where the response is in scope, then re-raise unchanged so
        # the view's existing 503-on-failure behavior is untouched.
        logger.error(
            "Routes API request failed: %s %s — response body: %s",
            response.status_code, response.reason_phrase, response.text,
        )
        raise
    data = response.json()

    routes = data.get("routes") or []
    if not routes:
        raise RuntimeError("Google Routes API returned no route.")

    route = routes[0]
    return {
        "distance_meters": route.get("distanceMeters"),
        "duration_seconds": _parse_duration_seconds(route.get("duration")),
        "polyline": (route.get("polyline") or {}).get("encodedPolyline"),
    }


def _parse_duration_seconds(duration_str):
    # Google returns route duration as a string like "1234s".
    if not duration_str:
        return None
    try:
        return int(str(duration_str).rstrip("s"))
    except ValueError:
        return None


def update_incident_status(incident: Incident, new_status: str, actor) -> Incident:
    incident.update_status(new_status)
    _log(incident, new_status, actor=actor)
    return incident


def submit_treatment_notes(incident: Incident, author, data: dict) -> TreatmentNote:
    is_draft = data.get("is_draft", False)
    note, _ = TreatmentNote.objects.update_or_create(
        incident=incident,
        defaults={
            "authored_by": author,
            "chief_complaint": data.get("chief_complaint", ""),
            "treatment_administered": data.get("treatment_administered", ""),
            "blood_pressure": data.get("blood_pressure", ""),
            "spo2": data.get("spo2", ""),
            "heart_rate": data.get("heart_rate", ""),
            "medications_given": data.get("medications_given", ""),
            "additional_notes": data.get("additional_notes", ""),
            "is_draft": is_draft,
        },
    )
    if not is_draft:
        note.submit()
        _log(incident, "treatment_notes_submitted", actor=author)
        if incident.destination_hospital_id:
            _notify("Hospital %s would receive treatment notes update.", incident.destination_hospital_id)
    return note


def _patient_is_verified(user) -> bool:
    return True
