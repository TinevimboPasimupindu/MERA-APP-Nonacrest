# Core data models for the MERA emergency response flow.

# SOS panic button (verified patients only)
# Confirmation countdown screen
# Auto-confirm on timer expiry
# Real-time GPS capture
# SMS emergency contacts
# Push to ambulance services
# Cancel active alert
# Emergency log
# Patient emergency history
# Ambulance incoming alert view (location/distance only, no medical data)
# Accept alert — exclusive assignment
# Medical profile unlocked to accepting ambulance only
# Destination hospital selection
# Hospital en-route notification
# Incident status progression
# Treatment notes capture
# Treatment notes submitted to hospital + stored in history

# Medical data restricted to accepting ambulance only
# Access revoked on Completed/Cancelled
# Alert dispatched within 3 s of confirmation
# Medical profile retrieved within 5 s of acceptance
# Offline queue: local store then transmit on restore
# SOS initiates even without connectivity

import uuid
from django.db import models
from django.conf import settings
from django.utils import timezone

# Choice constants

class IncidentStatus(models.TextChoices):
    PENDING_CONFIRMATION = "pending_confirmation", "Pending Confirmation"  # SOS pressed, awaiting confirm
    ACTIVE = "active", "Active"                  # Confirmed, broadcasting to ambulances
    DISPATCHED = "dispatched", "Dispatched"      # Ambulance accepted
    ON_THE_WAY = "on_the_way", "On the Way"
    ARRIVED_ON_SCENE = "arrived_on_scene", "Arrived on Scene"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"


class PriorityLevel(models.TextChoices):
    LOW = "low", "Low"
    MEDIUM = "medium", "Medium"
    HIGH = "high", "High"
    CRITICAL = "critical", "Critical"


class ActivationMethod(models.TextChoices):
    MANUAL = "manual", "Manual (Patient confirmed)"
    AUTO = "auto", "Auto-confirmed (Timer expired)"
    OFFLINE = "offline", "Offline (Queued and transmitted)"

# Incident

class Incident(models.Model):
    # Central record for a single emergency event.
    # One SOS trigger = one Incident.

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # ── Parties ──────────────────────────────────────────────────────────── #
    patient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="incidents_as_patient",
        limit_choices_to={"role": "patient"},
    )
    ambulance_service = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="incidents_as_responder",
        limit_choices_to={"role": "ambulance_service"},
    )
    destination_hospital = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="incidents_as_destination",
        limit_choices_to={"role": "hospital"},
    )

    # Status & priority 
    status = models.CharField(
        max_length=30,
        choices=IncidentStatus.choices,
        default=IncidentStatus.PENDING_CONFIRMATION,
        db_index=True,
    )
    priority_level = models.CharField(
        max_length=10,
        choices=PriorityLevel.choices,
        default=PriorityLevel.HIGH,
    )
    activation_method = models.CharField(
        max_length=10,
        choices=ActivationMethod.choices,
        default=ActivationMethod.MANUAL,
    )

    # GPS 
    # Stored as decimal lat/lng. 
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    location_accuracy_metres = models.FloatField(null=True, blank=True)

    # Timing 
    triggered_at = models.DateTimeField(default=timezone.now)         # SOS button pressed
    confirmed_at = models.DateTimeField(null=True, blank=True)        # Patient confirmed / auto-confirmed
    accepted_at = models.DateTimeField(null=True, blank=True)         # Ambulance accepted
    arrived_at = models.DateTimeField(null=True, blank=True)          # On scene
    completed_at = models.DateTimeField(null=True, blank=True)        # Resolved
    cancelled_at = models.DateTimeField(null=True, blank=True)

    # En-route info 
    eta_minutes = models.PositiveSmallIntegerField(null=True, blank=True)

    # Offline support 
    # Alert can be queued on device and transmitted later.
    # Device sets this flag when the alert was created while offline.
    was_offline_queued = models.BooleanField(default=False)
    offline_queued_at = models.DateTimeField(null=True, blank=True)

    # Access control flag 
    # Medical profile access is controlled programmatically.
    # This flag is set True on acceptance and False on Completed/Cancelled.
    medical_profile_access_granted = models.BooleanField(default=False)

    # Cancellation 
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="incidents_cancelled",
    )
    cancellation_reason = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-triggered_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["patient", "status"]),
            models.Index(fields=["ambulance_service", "status"]),
        ]
        verbose_name = "Incident"
        verbose_name_plural = "Incidents"

    def __str__(self):
        return f"Incident {str(self.id)[:8].upper()} — {self.patient} [{self.status}]"

    # Business logic helpers 

    def confirm(self, method: str = ActivationMethod.MANUAL) -> None:
        # Transition from PENDING_CONFIRMATION → ACTIVE.
        self.status = IncidentStatus.ACTIVE
        self.confirmed_at = timezone.now()
        self.activation_method = method
        self.save(update_fields=["status", "confirmed_at", "activation_method", "updated_at"])

    def accept(self, ambulance_user) -> None:
        # Assign ambulance and unlock medical profile.
        # Only the accepting service gets access.
        self.status = IncidentStatus.DISPATCHED
        self.ambulance_service = ambulance_user
        self.accepted_at = timezone.now()
        self.medical_profile_access_granted = True
        self.save(update_fields=[
            "status", "ambulance_service", "accepted_at",
            "medical_profile_access_granted", "updated_at",
        ])

    def update_status(self, new_status: str) -> None:
        # Progress through dispatcher stages."""
        now = timezone.now()
        update_fields = ["status", "updated_at"]
        self.status = new_status

        if new_status == IncidentStatus.ON_THE_WAY:
            pass
        elif new_status == IncidentStatus.ARRIVED_ON_SCENE:
            self.arrived_at = now
            update_fields.append("arrived_at")
        elif new_status == IncidentStatus.COMPLETED:
            self.completed_at = now
            self.medical_profile_access_granted = False  # NFR-04
            update_fields += ["completed_at", "medical_profile_access_granted"]
        elif new_status == IncidentStatus.CANCELLED:
            self.cancelled_at = now
            self.medical_profile_access_granted = False  # NFR-04
            update_fields += ["cancelled_at", "medical_profile_access_granted"]

        self.save(update_fields=update_fields)

    def cancel(self, cancelled_by_user, reason: str = "") -> None:
        # Cancel with confirmation prompt (prompt handled on frontend).
        self.cancelled_by = cancelled_by_user
        self.cancellation_reason = reason
        self.update_status(IncidentStatus.CANCELLED)
        self.save(update_fields=["cancelled_by", "cancellation_reason"])

# Treatment Notes 

class TreatmentNote(models.Model):
    # Paramedic notes captured on scene.
    # Submitted to the receiving hospital and stored in patient history.

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    incident = models.OneToOneField(
        Incident,
        on_delete=models.CASCADE,
        related_name="treatment_note",
    )
    authored_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="treatment_notes_authored",
    )

    chief_complaint = models.TextField(help_text="Presenting condition as found on scene.")
    treatment_administered = models.TextField(help_text="Step-by-step treatment given.")
    blood_pressure = models.CharField(max_length=20, blank=True, default="")
    spo2 = models.CharField(max_length=10, blank=True, default="", verbose_name="SpO₂ (%)")
    heart_rate = models.CharField(max_length=10, blank=True, default="")
    medications_given = models.TextField(blank=True, default="")
    additional_notes = models.TextField(blank=True, default="")

    is_draft = models.BooleanField(default=False)  # AF-01: Save draft
    submitted_at = models.DateTimeField(null=True, blank=True)  # Set on final submit

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Treatment Note"
        verbose_name_plural = "Treatment Notes"

    def __str__(self):
        return f"Treatment Note — Incident {str(self.incident_id)[:8].upper()}"

    def submit(self) -> None:
        """FR-41: Mark as submitted and record timestamp."""
        self.is_draft = False
        self.submitted_at = timezone.now()
        self.save(update_fields=["is_draft", "submitted_at", "updated_at"])

# Emergency Log 

class EmergencyLog(models.Model):
    # Immutable audit log entry for each significant state change on an Incident.
    # Log every alert with date, time, GPS, activation method, resolution.
    # Patients can view their full history including ambulance details.

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    incident = models.ForeignKey(
        Incident,
        on_delete=models.CASCADE,
        related_name="log_entries",
    )

    EVENT_CHOICES = [
        ("sos_triggered", "SOS Triggered"),
        ("sos_confirmed", "SOS Confirmed"),
        ("sos_auto_confirmed", "SOS Auto-Confirmed"),
        ("sos_cancelled", "SOS Cancelled"),
        ("ambulance_notified", "Ambulance Notified"),
        ("ambulance_accepted", "Ambulance Accepted"),
        ("dispatched", "Dispatched"),
        ("on_the_way", "On the Way"),
        ("arrived_on_scene", "Arrived on Scene"),
        ("hospital_notified", "Hospital Notified"),
        ("treatment_notes_submitted", "Treatment Notes Submitted"),
        ("completed", "Completed"),
        ("contacts_notified", "Emergency Contacts Notified"),
        ("offline_queued", "Alert Queued Offline"),
        ("offline_transmitted", "Offline Alert Transmitted"),
    ]
    event_type = models.CharField(max_length=40, choices=EVENT_CHOICES)
    description = models.TextField(blank=True, default="")

    # Snapshot of GPS at time of event (may differ from incident's initial coords)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="emergency_log_actions",
        help_text="User who triggered this event (null for system events).",
    )

    logged_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["logged_at"]
        verbose_name = "Emergency Log Entry"
        verbose_name_plural = "Emergency Log Entries"

    def __str__(self):
        return f"[{self.event_type}] Incident {str(self.incident_id)[:8].upper()} @ {self.logged_at:%Y-%m-%d %H:%M}"
