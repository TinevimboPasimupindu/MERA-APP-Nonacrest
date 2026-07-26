# Blank profile auto-created on patient registration
# Medical intake form (blood type, conditions, meds, allergies, notes)
# Secure storage of medical history
# Patient can update their own profile (resets to Pending Review)
# Hospital can update a verified patient's profile (no status reset)
# Profile retrieved and shown to accepting ambulance during emergency
# POPI consent tracked here
# Consent can be withdrawn at any time

import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone


class BloodType(models.TextChoices):
    A_POS  = "A+",  "A+"
    A_NEG  = "A-",  "A-"
    B_POS  = "B+",  "B+"
    B_NEG  = "B-",  "B-"
    AB_POS = "AB+", "AB+"
    AB_NEG = "AB-", "AB-"
    O_POS  = "O+",  "O+"
    O_NEG  = "O-",  "O-"
    UNKNOWN = "unknown", "Unknown"


class VerificationStatus(models.TextChoices):
    UNSUBMITTED  = "unsubmitted",   "Unsubmitted"
    PENDING      = "pending",       "Pending Review"
    IN_PROGRESS  = "in_progress",   "In Progress"
    VERIFIED     = "verified",      "Verified"
    FLAGGED      = "flagged",       "Flagged — In-Person Visit Required"
    INFO_REQUESTED = "info_requested", "More Information Requested"


class MedicalProfile(models.Model):
    # One-to-one with a Patient User.
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="medical_profile",
        limit_choices_to={"role": "patient"},
    )

    # Core medical fields
    blood_type = models.CharField(
        max_length=10, choices=BloodType.choices,
        default=BloodType.UNKNOWN, blank=True,
    )
    chronic_conditions = models.TextField(
        blank=True, default="",
        help_text="Comma-separated or free text list of chronic conditions.",
    )
    current_medications = models.TextField(
        blank=True, default="",
        help_text="Current medication names and dosages.",
    )
    known_allergies = models.TextField(
        blank=True, default="",
        help_text="Known allergies (medications, food, environmental).",
    )
    paramedic_notes = models.TextField(
        blank=True, default="",
        help_text="Optional notes for paramedics (e.g. carries EpiPen at all times).",
    )

    # Verification status 
    verification_status = models.CharField(
        max_length=20,
        choices=VerificationStatus.choices,
        default=VerificationStatus.UNSUBMITTED,
        db_index=True,
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    # Hospital that last verified this profile
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="profiles_verified",
        limit_choices_to={"role": "hospital_admin"},
    )

    # Track hospital edits separately from patient edits 
    last_updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="profiles_updated",
    )
    last_updated_at = models.DateTimeField(null=True, blank=True)

    # POPI consent: Hospitals & Ambulances 
    data_sharing_consent = models.BooleanField(default=False)
    consent_given_at = models.DateTimeField(null=True, blank=True)
    consent_withdrawn_at = models.DateTimeField(null=True, blank=True)

    # AI Chatbot consent — separate from hospital/ambulance data sharing consent
    ai_chatbot_consent = models.BooleanField(default=False)
    ai_chatbot_consent_given_at = models.DateTimeField(null=True, blank=True)
    ai_chatbot_consent_withdrawn_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Medical Profile"
        verbose_name_plural = "Medical Profiles"

    def __str__(self):
        return f"Profile — {self.patient.get_full_name()} [{self.verification_status}]"

    # Business logic helpers 

    def submit_by_patient(self) -> None:
    # Auto-verified for prototype — skipping hospital verification flow.
        self.verification_status = VerificationStatus.VERIFIED
        self.verified_at = timezone.now()
        self.last_updated_by = self.patient
        self.last_updated_at = timezone.now()
        self.save(update_fields=[
        "verification_status", "verified_at", "last_updated_by", "last_updated_at", "updated_at",
    ])

    def update_by_hospital(self, hospital_user) -> None:
        # Hospital edits do NOT reset verification status.
        self.last_updated_by = hospital_user
        self.last_updated_at = timezone.now()
        self.save(update_fields=["last_updated_by", "last_updated_at", "updated_at"])

    def mark_verified(self, hospital_user) -> None:
        self.verification_status = VerificationStatus.VERIFIED
        self.verified_at = timezone.now()
        self.verified_by = hospital_user
        self.save(update_fields=[
            "verification_status", "verified_at", "verified_by", "updated_at",
        ])

    def grant_consent(self) -> None:
        # Record explicit data sharing consent.
        self.data_sharing_consent = True
        self.consent_given_at = timezone.now()
        self.consent_withdrawn_at = None
        self.save(update_fields=[
            "data_sharing_consent", "consent_given_at", "consent_withdrawn_at", "updated_at",
        ])

    def withdraw_consent(self) -> None:
        # Patient withdraws consent — immediate effect.
        self.data_sharing_consent = False
        self.consent_withdrawn_at = timezone.now()
        self.save(update_fields=[
            "data_sharing_consent", "consent_withdrawn_at", "updated_at",
        ])

    def grant_ai_chatbot_consent(self) -> None:
        # Record explicit consent for AI chatbot use of medical profile.
        self.ai_chatbot_consent = True
        self.ai_chatbot_consent_given_at = timezone.now()
        self.ai_chatbot_consent_withdrawn_at = None
        self.save(update_fields=[
            "ai_chatbot_consent", "ai_chatbot_consent_given_at",
            "ai_chatbot_consent_withdrawn_at", "updated_at",
        ])

    def withdraw_ai_chatbot_consent(self) -> None:
        # Patient withdraws AI chatbot consent — immediate effect.
        self.ai_chatbot_consent = False
        self.ai_chatbot_consent_withdrawn_at = timezone.now()
        self.save(update_fields=[
            "ai_chatbot_consent", "ai_chatbot_consent_withdrawn_at", "updated_at",
        ])

        
    @property
    def is_verified(self) -> bool:
        return self.verification_status == VerificationStatus.VERIFIED

    @property
    def sos_unlocked(self) -> bool:
        # FR-25: SOS button only available to verified patients with active consent.
        return self.is_verified and self.data_sharing_consent
