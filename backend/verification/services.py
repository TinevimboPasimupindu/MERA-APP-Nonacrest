import logging

from django.utils import timezone

from medical_profiles.models import MedicalProfile, VerificationStatus
from .models import VerificationRequest, VerificationRequestStatus

logger = logging.getLogger(__name__)


def _stamp_review(request: VerificationRequest, reviewer, note: str = "") -> None:
    request.reviewed_at = timezone.now()
    request.reviewed_by = reviewer
    request.hospital_note = note


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


def flag_verification(verification_request: VerificationRequest, reviewed_by, note: str) -> None:
    _stamp_review(verification_request, reviewed_by, note=note)
    verification_request.status = VerificationRequestStatus.FLAGGED
    verification_request.save(update_fields=[
        "status", "hospital_note", "reviewed_at", "reviewed_by", "updated_at",
    ])
    profile: MedicalProfile = verification_request.patient.medical_profile
    profile.verification_status = VerificationStatus.FLAGGED
    profile.save(update_fields=["verification_status", "updated_at"])
    logger.info(
        "[NOTIFY STUB] Patient %s — flagged for in-person visit.",
        verification_request.patient_id,
    )


def request_more_info(verification_request: VerificationRequest, reviewed_by, note: str) -> None:
    _stamp_review(verification_request, reviewed_by, note=note)
    verification_request.status = VerificationRequestStatus.INFO_REQUESTED
    verification_request.save(update_fields=[
        "status", "hospital_note", "reviewed_at", "reviewed_by", "updated_at",
    ])
    profile: MedicalProfile = verification_request.patient.medical_profile
    profile.verification_status = VerificationStatus.INFO_REQUESTED
    profile.save(update_fields=["verification_status", "updated_at"])
    logger.info(
        "[NOTIFY STUB] Patient %s — more info requested.",
        verification_request.patient_id,
    )
