import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone


class VerificationRequestStatus(models.TextChoices):
    PENDING       = "pending",        "Pending"
    IN_PROGRESS   = "in_progress",    "In Progress"
    APPROVED      = "approved",       "Approved"
    FLAGGED       = "flagged",        "Flagged — In-Person Visit"
    INFO_REQUESTED = "info_requested", "More Information Requested"
    WITHDRAWN     = "withdrawn",      "Withdrawn by Patient"


class VerificationRequest(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    patient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="verification_requests",
        limit_choices_to={"role": "patient"},
    )
    hospital = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="verification_queue",
        limit_choices_to={"role": "hospital"},
    )

    status = models.CharField(
        max_length=20,
        choices=VerificationRequestStatus.choices,
        default=VerificationRequestStatus.PENDING,
        db_index=True,
    )

    # Written note displayed to patient when flagged for in-person visit
    hospital_note = models.TextField(
        blank=True, default="",
        help_text="Note shown to patient when flagged or more info requested.",
    )

    # Timestamps for SLA tracking (urgency badges for overdue reviews)
    submitted_at = models.DateTimeField(default=timezone.now)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="verifications_reviewed",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-submitted_at"]
        indexes = [
            models.Index(fields=["hospital", "status"]),
            models.Index(fields=["patient", "status"]),
        ]
        verbose_name = "Verification Request"
        verbose_name_plural = "Verification Requests"

    def __str__(self):
        return (
            f"VerReq — {self.patient.get_full_name()} → "
            f"{self.hospital.get_full_name()} [{self.status}]"
        )

    @property
    def hours_since_submission(self) -> float:
        delta = timezone.now() - self.submitted_at
        return delta.total_seconds() / 3600

    @property
    def urgency_badge(self) -> str:
        h = self.hours_since_submission
        if h < 24:
            return "new"
        if h < 48:
            return "approaching"
        return "overdue"
