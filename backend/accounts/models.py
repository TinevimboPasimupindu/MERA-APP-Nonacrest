# Patient registration
# Hospital registration (3-step, pending approval)
# Ambulance service registration (3-step, pending approval)
# Login with role-based redirect
# Password reset
# Role-based access control (role is permanent after registration)
# Institutional accounts placed in pending state until MERA admin approves
# Passwords hashed 
# Account locked after 5 consecutive failed login attempts

import uuid
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone

# Role choices

class Role(models.TextChoices):
    PATIENT = "patient", "Patient"
    HOSPITAL = "hospital", "Hospital"
    AMBULANCE_SERVICE = "ambulance_service", "Ambulance Service"

    # New roles — added alongside existing ones while the team finalizes
    # the full migration plan for hospital/ambulance restructuring.
    HOSPITAL_ADMIN = "hospital_admin", "Hospital Admin"
    AMBULANCE_ADMIN = "ambulance_admin", "Ambulance Admin"
    EMT = "emt", "EMT"
    MERA_ADMIN = "mera_admin", "MERA Admin"


# Role-group helpers — the team hasn't decided on a hard rename yet
# (see PROJECT_CONTEXT.md), so old and new role values are treated as
# equivalent everywhere permission/role checks happen. Use these sets
# instead of comparing against a single literal role string.
HOSPITAL_ROLES = {Role.HOSPITAL, Role.HOSPITAL_ADMIN}
AMBULANCE_ROLES = {Role.AMBULANCE_SERVICE, Role.AMBULANCE_ADMIN}

# Institutional approval state

class InstitutionalStatus(models.TextChoices):
    # Hospital and Ambulance accounts start as PENDING until the MERA
    # admin team reviews their documentation and approves them.
    # Patients are always APPROVED immediately upon registration.

    PENDING = "pending", "Pending Review"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"

# Manager

class UserManager(BaseUserManager):

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("An email address is required.")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", Role.PATIENT)
        extra_fields.setdefault("institutional_status", InstitutionalStatus.APPROVED)
        return self.create_user(email, password, **extra_fields)

# User

class User(AbstractBaseUser, PermissionsMixin):
    # Single User model for all three roles.
    # Role-specific fields are nullable and only populated for the relevant role.

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    #Shared fields (all roles)
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=Role.choices, db_index=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    failed_login_attempts = models.PositiveSmallIntegerField(default=0)
    is_locked = models.BooleanField(default=False)
    locked_at = models.DateTimeField(null=True, blank=True)

    # PROTOTYPE: All roles auto-approved. Reinstate PENDING default for hospitals/ambulances pre-launch.
    # Patients are always APPROVED. Hospitals/Ambulances start as PENDING.
    institutional_status = models.CharField(
        max_length=10,
        choices=InstitutionalStatus.choices,
        default=InstitutionalStatus.APPROVED,
    )
    institutional_status_updated_at = models.DateTimeField(null=True, blank=True)
    institutional_rejection_reason = models.TextField(blank=True, default="")

    # Patient-specific fields
    full_name = models.CharField(max_length=255, blank=True, default="")
    phone_number = models.CharField(max_length=20, blank=True, default="")
    gender = models.CharField(
        max_length=20,
        blank=True,
        default="",
        choices=[
            ("male", "Male"),
            ("female", "Female"),
            ("other", "Other"),
            ("prefer_not_to_say", "Prefer not to say"),
        ],
    )
    date_of_birth = models.DateField(null=True, blank=True)

    # Hospital-specific fields
    facility_name = models.CharField(max_length=255, blank=True, default="")
    facility_type = models.CharField(
        max_length=20,
        blank=True,
        default="",
        choices=[
            ("private", "Private"),
            ("public", "Public"),
            ("clinic", "Clinic"),
        ],
    )
    facility_registration_number = models.CharField(max_length=100, blank=True, default="")
    admin_contact_name = models.CharField(max_length=255, blank=True, default="")
    admin_title = models.CharField(max_length=100, blank=True, default="")
    admin_phone = models.CharField(max_length=20, blank=True, default="")
    official_address = models.TextField(blank=True, default="")
    province = models.CharField(max_length=100, blank=True, default="")
    has_emergency_unit = models.BooleanField(default=False)
    ed_phone = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="Emergency department direct phone number.",
    )
    departments = models.JSONField(
        default=list,
        blank=True,
        help_text="List of department names available at this facility.",
    )
    visiting_hours = models.CharField(max_length=255, blank=True, default="")

    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    # Ambulance-specific fields
    service_name = models.CharField(max_length=255, blank=True, default="")
    service_type = models.CharField(
        max_length=20,
        blank=True,
        default="",
        choices=[
            ("private", "Private"),
            ("public", "Public / Government"),
        ],
    )
    license_number = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Official EMS operating license number.",
    )
    dispatch_phone = models.CharField(max_length=20, blank=True, default="")
    dispatch_address = models.CharField(max_length=255, blank=True, default="")
    base_address = models.TextField(
        blank=True,
        default="",
        help_text="Physical base/depot address of the ambulance service.",
    )
    operational_areas = models.JSONField(
        default=list,
        blank=True,
        help_text="List of suburb/city strings this service covers.",
    )
    # Capabilities e.g. ["ALS", "BLS", "ICU Transport"]
    capabilities = models.JSONField(default=list, blank=True)
    number_of_active_ambulances = models.PositiveSmallIntegerField(default=0)
    active_units = models.PositiveSmallIntegerField(
        default=0,
        help_text="Number of units currently active and on the road.",
    )
    preferred_hospitals = models.JSONField(
        default=list,
        blank=True,
        help_text="List of MERA-registered hospital names this service typically uses.",
    )
    # Availability toggle for dispatcher
    is_available = models.BooleanField(default=True)

    # EMT-specific fields
    ambulance_service = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="emts",
        limit_choices_to={"role__in": AMBULANCE_ROLES},
        help_text=(
            "Only populated when role=EMT — the ambulance_admin (or legacy "
            "ambulance_service) account this EMT works under. "
            "Access an ambulance admin's crew via `ambulance_admin_user.emts.all()`."
        ),
    )

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["role"]

    objects = UserManager()

    class Meta:
        verbose_name = "User"
        verbose_name_plural = "Users"
        indexes = [
            models.Index(fields=["role"]),
            models.Index(fields=["role", "is_active"]),
            models.Index(fields=["institutional_status"]),
        ]

    def __str__(self):
        display = self.get_display_name()
        return f"{display} <{self.email}> [{self.role}]"

    # Name helpers 

    def get_full_name(self) -> str:
        if self.role in (Role.PATIENT, Role.EMT):
            return self.full_name.strip() or self.email
        if self.role in HOSPITAL_ROLES:
            return self.facility_name.strip() or self.email
        if self.role in AMBULANCE_ROLES:
            return self.service_name.strip() or self.email
        return self.email

    def get_short_name(self) -> str:
        return self.get_full_name().split()[0] if self.get_full_name() else self.email

    def get_display_name(self) -> str:
        """Alias used in admin and __str__."""
        return self.get_full_name()

    # Role guards 

    @property
    def is_patient(self) -> bool:
        return self.role == Role.PATIENT

    @property
    def is_hospital(self) -> bool:
        return self.role in HOSPITAL_ROLES

    @property
    def is_ambulance_service(self) -> bool:
        return self.role in AMBULANCE_ROLES

    @property
    def is_mera_admin(self) -> bool:
        return self.role == Role.MERA_ADMIN or self.is_staff

    @property
    def is_institutional_approved(self) -> bool:
        # True only when MERA admin has approved the account.
        return self.institutional_status == InstitutionalStatus.APPROVED

    # Login helpers 

    def record_failed_login(self) -> None:
        # Increment counter and lock after 5 failures.
        self.failed_login_attempts += 1
        if self.failed_login_attempts >= 5:
            self.is_locked = True
            self.locked_at = timezone.now()
        self.save(update_fields=["failed_login_attempts", "is_locked", "locked_at"])

    def reset_login_attempts(self) -> None:
        self.failed_login_attempts = 0
        self.is_locked = False
        self.locked_at = None
        self.save(update_fields=["failed_login_attempts", "is_locked", "locked_at"])

# Supporting document upload model 

class InstitutionalDocument(models.Model):
    # Official supporting documentation uploaded during
    # hospital or ambulance service registration.
    # Reviewed by MERA admin during the approval process.

    DOCUMENT_TYPE_CHOICES = [
        ("health_facility_certificate", "Health Facility Certificate"),
        ("cipc_registration", "CIPC Registration Document"),
        ("fleet_insurance", "Fleet Insurance Certificate"),
        ("ems_operating_license", "EMS Operating License"),
        ("hpcsa_doh_registration", "HPCSA / DoH Registration"),
        ("other", "Other"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="institutional_documents",
    )
    document_type = models.CharField(max_length=40, choices=DOCUMENT_TYPE_CHOICES)
    file = models.FileField(upload_to="institutional_docs/%Y/%m/")
    uploaded_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        verbose_name = "Institutional Document"
        verbose_name_plural = "Institutional Documents"

    def __str__(self):
        return f"{self.document_type} — {self.user.get_display_name()}"

# Password reset token 

class PasswordResetToken(models.Model):
    # Stores a short-lived token for secure password reset.
    # The token is emailed to the user and consumed on use.

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="password_reset_tokens")
    token = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Password Reset Token"

    def __str__(self):
        return f"Reset token for {self.user.email} — {'used' if self.used else 'active'}"

    @property
    def is_valid(self) -> bool:
        return not self.used and timezone.now() < self.expires_at