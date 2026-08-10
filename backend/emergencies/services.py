"""
Emergency services — prototype version.
Notifications are replaced with logger.info stubs (no notifications app needed).
WebSocket broadcast is a no-op (no Channels/Redis needed).
"""
import logging

import httpx
from django.conf import settings
from django.db import transaction
from django.utils import timezone

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


# SOS Trigger

def trigger_sos(patient_user, validated_data: dict) -> Incident:
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
    return incident


def confirm_sos(incident: Incident, method: str = ActivationMethod.MANUAL) -> Incident:
    if incident.status != IncidentStatus.PENDING_CONFIRMATION:
        raise ValueError(f"Cannot confirm incident in status '{incident.status}'.")

    with transaction.atomic():
        incident.confirm(method=method)
        event = "sos_auto_confirmed" if method == ActivationMethod.AUTO else "sos_confirmed"
        _log(incident, event, actor=incident.patient)

    _notify("Emergency contacts for patient %s would be SMS'd.", incident.patient_id)
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
