import logging

from django.db import transaction
from django.utils import timezone

from medical_profiles.models import MedicalProfile, VerificationStatus
from .models import VerificationRequest, VerificationRequestStatus

logger = logging.getLogger(__name__)

# Two records describe a patient's verification state:
#   - VerificationRequest.status — what the hospital dashboard / queue /
#     flagged / approved endpoints read.
#   - MedicalProfile.verification_status — what the hospital Patient List,
#     SOS/EMT gating (is_verified) and the patient's own profile read.
# They must never disagree, so every write that changes one goes through a
# function in this module that changes both, in one transaction. The
# patient's "live" request is their latest non-withdrawn one; submitting to
# a new hospital withdraws every other request, so there is at most one.

REQUEST_TO_PROFILE_STATUS = {
    VerificationRequestStatus.PENDING:        VerificationStatus.PENDING,
    VerificationRequestStatus.IN_PROGRESS:    VerificationStatus.IN_PROGRESS,
    VerificationRequestStatus.APPROVED:       VerificationStatus.VERIFIED,
    VerificationRequestStatus.FLAGGED:        VerificationStatus.FLAGGED,
    VerificationRequestStatus.INFO_REQUESTED: VerificationStatus.INFO_REQUESTED,
}


def latest_active_request(patient):
    return (
        VerificationRequest.objects
        .filter(patient=patient)
        .exclude(status=VerificationRequestStatus.WITHDRAWN)
        .order_by("-submitted_at")
        .first()
    )


def _stamp_review(request: VerificationRequest, reviewer, note: str = "") -> None:
    request.reviewed_at = timezone.now()
    request.reviewed_by = reviewer
    request.hospital_note = note


def _set_profile_status(profile: MedicalProfile, new_status: str) -> None:
    profile.verification_status = new_status
    profile.save(update_fields=["verification_status", "updated_at"])


@transaction.atomic
def approve_verification(verification_request: VerificationRequest, reviewed_by) -> None:
    _stamp_review(verification_request, reviewed_by)
    verification_request.status = VerificationRequestStatus.APPROVED
    verification_request.save(update_fields=[
        "status", "hospital_note", "reviewed_at", "reviewed_by", "updated_at",
    ])
    profile: MedicalProfile = verification_request.patient.medical_profile
    profile.mark_verified(hospital_user=reviewed_by)
    logger.info(
        "[NOTIFY STUB] Patient %s — profile verified.",
        verification_request.patient_id,
    )


@transaction.atomic
def flag_verification(verification_request: VerificationRequest, reviewed_by, note: str) -> None:
    _stamp_review(verification_request, reviewed_by, note=note)
    verification_request.status = VerificationRequestStatus.FLAGGED
    verification_request.save(update_fields=[
        "status", "hospital_note", "reviewed_at", "reviewed_by", "updated_at",
    ])
    _set_profile_status(verification_request.patient.medical_profile, VerificationStatus.FLAGGED)
    logger.info(
        "[NOTIFY STUB] Patient %s — flagged for in-person visit.",
        verification_request.patient_id,
    )


@transaction.atomic
def request_more_info(verification_request: VerificationRequest, reviewed_by, note: str) -> None:
    _stamp_review(verification_request, reviewed_by, note=note)
    verification_request.status = VerificationRequestStatus.INFO_REQUESTED
    # A new question makes any earlier answer stale.
    verification_request.patient_response = ""
    verification_request.patient_responded_at = None
    verification_request.save(update_fields=[
        "status", "hospital_note", "reviewed_at", "reviewed_by",
        "patient_response", "patient_responded_at", "updated_at",
    ])
    _set_profile_status(verification_request.patient.medical_profile, VerificationStatus.INFO_REQUESTED)
    logger.info(
        "[NOTIFY STUB] Patient %s — more info requested.",
        verification_request.patient_id,
    )


@transaction.atomic
def submit_to_hospital(patient, hospital) -> VerificationRequest:
    # Withdraw EVERY other live request — flagged and approved included, not
    # just pending/info_requested. Leaving a flagged request behind at the old
    # hospital is what let its dashboard keep counting a flag while the
    # Patient List (reading the profile) showed something else.
    now = timezone.now()
    (
        VerificationRequest.objects
        .filter(patient=patient)
        .exclude(status=VerificationRequestStatus.WITHDRAWN)
        .update(status=VerificationRequestStatus.WITHDRAWN, updated_at=now)
    )
    request = VerificationRequest.objects.create(
        patient=patient,
        hospital=hospital,
        status=VerificationRequestStatus.PENDING,
        submitted_at=now,
    )
    _set_profile_status(patient.medical_profile, VerificationStatus.PENDING)
    return request


@transaction.atomic
def record_patient_edit(profile: MedicalProfile, response: str = "") -> None:
    # Patient saved their medical data: profile goes back to Pending and their
    # live request (whatever state the hospital left it in) goes back into
    # that hospital's queue, with the SLA clock restarted. A patient with no
    # request yet (mid-intake, before choosing a hospital) just gets Pending.
    #
    # When that request was waiting on them (info_requested), this save IS
    # their answer: stamp patient_responded_at (plus any free-text reply) so
    # the hospital's re-review shows what it asked and what came back.
    profile.submit_by_patient()
    live = latest_active_request(profile.patient)
    if not live:
        return
    fields = []
    if live.status == VerificationRequestStatus.INFO_REQUESTED:
        live.patient_response = response.strip()
        live.patient_responded_at = timezone.now()
        fields += ["patient_response", "patient_responded_at"]
    if live.status != VerificationRequestStatus.PENDING:
        live.status = VerificationRequestStatus.PENDING
        live.submitted_at = timezone.now()
        fields += ["status", "submitted_at"]
    if fields:
        live.save(update_fields=fields + ["updated_at"])
