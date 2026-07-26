"""
Emergency services — prototype version.
Notifications are replaced with logger.info stubs (no notifications app needed).
WebSocket broadcast is a no-op (no Channels/Redis needed).
"""
import logging

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
    cancellable = {IncidentStatus.PENDING_CONFIRMATION, IncidentStatus.ACTIVE}
    if incident.status not in cancellable:
        raise ValueError(f"Cannot cancel an incident in status '{incident.status}'.")

    with transaction.atomic():
        incident.cancel(cancelled_by_user=cancelled_by, reason=reason)
        _log(incident, "sos_cancelled", description=reason, actor=cancelled_by)

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
