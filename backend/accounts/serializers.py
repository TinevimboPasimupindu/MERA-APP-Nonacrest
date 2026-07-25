# Registration and auth serializers for all three user roles.

# Patient registration
# Hospital registration (3-step)
# Ambulance service registration (3-step)
# Password reset request + confirm

import secrets
from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from .models import InstitutionalDocument, InstitutionalStatus, PasswordResetToken, Role, User

# Shared helpers

def _validate_passwords(data: dict) -> dict:
    if data.get("password") != data.get("confirm_password"):
        raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
    return data


def _check_email_unique(email: str) -> None:
    if User.objects.filter(email=email).exists():
        raise serializers.ValidationError({"email": "An account with this email already exists."})

# Patient registration

class PatientRegistrationSerializer(serializers.ModelSerializer):
    # Register a new patient account.
    # POPI Act consent is captured here (popi_consent must be True).

    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)
    popi_consent = serializers.BooleanField(write_only=True)
    terms_consent = serializers.BooleanField(write_only=True)

    class Meta:
        model = User
        fields = [
            "full_name",
            "email",
            "phone_number",
            "password",
            "confirm_password",
            "popi_consent",
            "terms_consent",
        ]

    def validate_email(self, value):
        _check_email_unique(value)
        return value

    def validate(self, data):
        _validate_passwords(data)

        # Registration cannot proceed without POPI consent
        if not data.get("popi_consent"):
            raise serializers.ValidationError(
                {"popi_consent": "You must accept the POPI Act consent to register."}
            )
        if not data.get("terms_consent"):
            raise serializers.ValidationError(
                {"terms_consent": "You must accept the Terms and Conditions to register."}
            )
        return data

    def create(self, validated_data):
        validated_data.pop("confirm_password")
        validated_data.pop("popi_consent")
        validated_data.pop("terms_consent")

        return User.objects.create_user(
            role=Role.PATIENT,
            institutional_status=InstitutionalStatus.APPROVED,
            **validated_data,
        )

# Hospital registration (step 1 + 2 combined, docs in step 3)

class HospitalRegistrationSerializer(serializers.ModelSerializer):
    # Three-step hospital registration.
    # Steps 1 & 2 are captured here. Step 3 (document upload) uses
    # InstitutionalDocumentSerializer after the account is created.
    # Account is placed in PENDING state — no portal access until approved.

    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)
    terms_consent = serializers.BooleanField(write_only=True)

    class Meta:
        model = User
        fields = [
            # Step 1 — Facility details
            "facility_name",
            "facility_type",
            "facility_registration_number",
            "official_address",
            "province",
            "has_emergency_unit",
            "visiting_hours",
            "latitude",
            "longitude",
            # Step 2 — Admin contact
            "email",
            "admin_contact_name",
            "admin_phone",
            "phone_number",
            "password",
            "confirm_password",
            "terms_consent",
        ]

    def validate_email(self, value):
        _check_email_unique(value)
        return value

    def validate(self, data):
        _validate_passwords(data)
        if not data.get("terms_consent"):
            raise serializers.ValidationError(
                {"terms_consent": "You must agree to MERA's dispatch terms to register."}
            )
        return data

    def create(self, validated_data):
        validated_data.pop("confirm_password")
        validated_data.pop("terms_consent")

        return User.objects.create_user(
            role=Role.HOSPITAL,
            # PROTOTYPE: auto-approve; reinstate for production
            # institutional_status=InstitutionalStatus.PENDING,
            # is_active=False,
            institutional_status=InstitutionalStatus.APPROVED,
            **validated_data,
        )

# Ambulance service registration

class AmbulanceRegistrationSerializer(serializers.ModelSerializer):
    # Three-step ambulance service registration.
    # Account placed in PENDING state until MERA admin approves.

    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)
    terms_consent = serializers.BooleanField(write_only=True)

    class Meta:
        model = User
        fields = [
            # Step 1 — Service details
            "service_name",
            "service_type",
            "dispatch_phone",
            "dispatch_address",
            "operational_areas",
            "capabilities",
            "number_of_active_ambulances",
            "preferred_hospitals",
            # Step 2 — Contact & credentials
            "email",
            "admin_contact_name",
            "admin_phone",
            "password",
            "confirm_password",
            "terms_consent",
        ]

    def validate_email(self, value):
        _check_email_unique(value)
        return value

    def validate(self, data):
        _validate_passwords(data)
        if not data.get("terms_consent"):
            raise serializers.ValidationError(
                {"terms_consent": "You must agree to MERA's dispatch terms to register."}
            )
        return data

    def create(self, validated_data):
        validated_data.pop("confirm_password")
        validated_data.pop("terms_consent")

        return User.objects.create_user(
            role=Role.AMBULANCE_SERVICE,
            # PROTOTYPE: auto-approve; reinstate for production
            # institutional_status=InstitutionalStatus.PENDING,
            # is_active=False,
            institutional_status=InstitutionalStatus.APPROVED,
            **validated_data,
        )

# MERA Admin: create Hospital Admin account (institutional onboarding)

class HospitalAdminCreationSerializer(serializers.ModelSerializer):
    # Used by MERA admin to create a hospital_admin account directly.
    # No terms_consent (that's a self-registration artifact) and no
    # PENDING approval step — MERA already vetted the institution before
    # creating this account, so it's active and approved immediately.

    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = [
            "facility_name",
            "facility_type",
            "facility_registration_number",
            "official_address",
            "province",
            "has_emergency_unit",
            "visiting_hours",
            "latitude",
            "longitude",
            "email",
            "admin_contact_name",
            "admin_phone",
            "phone_number",
            "password",
            "confirm_password",
        ]

    def validate_email(self, value):
        _check_email_unique(value)
        return value

    def validate(self, data):
        _validate_passwords(data)
        return data

    def create(self, validated_data):
        validated_data.pop("confirm_password")

        return User.objects.create_user(
            role=Role.HOSPITAL_ADMIN,
            institutional_status=InstitutionalStatus.APPROVED,
            is_active=True,
            **validated_data,
        )

# MERA Admin: create Ambulance Admin account (institutional onboarding)

class AmbulanceAdminCreationSerializer(serializers.ModelSerializer):
    # Used by MERA admin to create an ambulance_admin account directly.
    # Same reasoning as HospitalAdminCreationSerializer above.

    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = [
            "service_name",
            "service_type",
            "dispatch_phone",
            "dispatch_address",
            "operational_areas",
            "capabilities",
            "number_of_active_ambulances",
            "preferred_hospitals",
            "email",
            "admin_contact_name",
            "admin_phone",
            "password",
            "confirm_password",
        ]

    def validate_email(self, value):
        _check_email_unique(value)
        return value

    def validate(self, data):
        _validate_passwords(data)
        return data

    def create(self, validated_data):
        validated_data.pop("confirm_password")

        return User.objects.create_user(
            role=Role.AMBULANCE_ADMIN,
            institutional_status=InstitutionalStatus.APPROVED,
            is_active=True,
            **validated_data,
        )

# Ambulance Admin: create EMT account

class EMTCreationSerializer(serializers.ModelSerializer):
    # Used by an ambulance_admin (or legacy ambulance_service) account to
    # create an EMT under their own service. No self-registration, no
    # approval queue — same reasoning as HospitalAdminCreationSerializer
    # above. The EMT is linked to whichever ambulance account created it via
    # the `ambulance_service` self-referencing FK, taken from request.user
    # in the view (passed in through serializer context, not client input —
    # an ambulance admin can only ever create EMTs under their own service).

    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = [
            "full_name",
            "email",
            "phone_number",
            "password",
            "confirm_password",
        ]

    def validate_email(self, value):
        _check_email_unique(value)
        return value

    def validate(self, data):
        _validate_passwords(data)
        return data

    def create(self, validated_data):
        validated_data.pop("confirm_password")
        ambulance_user = self.context["request"].user

        return User.objects.create_user(
            role=Role.EMT,
            institutional_status=InstitutionalStatus.APPROVED,
            is_active=True,
            ambulance_service=ambulance_user,
            **validated_data,
        )

# Ambulance Admin: edit one of their own EMTs

class EMTUpdateSerializer(serializers.ModelSerializer):
    # Contact-detail edits only. Role is permanent (assigned at creation)
    # and password changes go through the password-reset flow, not this
    # endpoint, so neither field is listed here.

    class Meta:
        model = User
        fields = ["full_name", "phone_number", "email"]

    def validate_email(self, value):
        if User.objects.exclude(pk=self.instance.pk).filter(email=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

# Step 3 — Document upload

class InstitutionalDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = InstitutionalDocument
        fields = ["id", "document_type", "file", "notes", "uploaded_at"]
        read_only_fields = ["id", "uploaded_at"]

    def create(self, validated_data):
        user = self.context["request"].user
        return InstitutionalDocument.objects.create(user=user, **validated_data)

# Login response (read-only user summary)

class UserSummarySerializer(serializers.ModelSerializer):
    # Returned in the login response and /me/ endpoint.

    display_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "role",
            "display_name",
            "institutional_status",
            "is_available",      # ambulance only
            "is_locked",
        ]
        read_only_fields = fields

    def get_display_name(self, obj):
        return obj.get_display_name()

# MERA Admin: institutions table (hospital_admin + ambulance_admin accounts)

class InstitutionSummarySerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "display_name", "role", "email", "institutional_status", "date_joined"]
        read_only_fields = fields

    def get_display_name(self, obj):
        return obj.get_display_name()

# MERA Admin: platform-wide account management table (every role)

class AdminUserListSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "display_name", "role", "email", "is_active", "institutional_status", "date_joined"]
        read_only_fields = fields

    def get_display_name(self, obj):
        return obj.get_display_name()

# Password reset

class PasswordResetRequestSerializer(serializers.Serializer):
    # Step 1: User submits their email to request a reset link.

    email = serializers.EmailField()

    def validate_email(self, value):
        # We intentionally do not raise an error if the email doesn't exist —
        # this prevents user enumeration attacks.
        return value

    def save(self):
        email = self.validated_data["email"]
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return  # Silent — see validate_email note above

        # Invalidate any existing unused tokens for this user
        PasswordResetToken.objects.filter(user=user, used=False).update(used=True)

        token_value = secrets.token_urlsafe(48)
        PasswordResetToken.objects.create(
            user=user,
            token=token_value,
            expires_at=timezone.now() + timedelta(hours=1),
        )

        # In production, send this via email (e.g. django.core.mail.send_mail).
        # The frontend deep-links to: mera://reset-password?token=<token_value>
        # For now, the token is available via the admin or a separate email task.
        # TODO: wire up email sending here (Sendgrid / AWS SES recommended).


class PasswordResetConfirmSerializer(serializers.Serializer):
    # Step 2: User submits their new password along with the token.

    token = serializers.CharField()
    new_password = serializers.CharField(min_length=8, write_only=True)
    confirm_password = serializers.CharField(write_only=True)

    def validate(self, data):
        if data["new_password"] != data["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})

        try:
            reset_token = PasswordResetToken.objects.select_related("user").get(
                token=data["token"]
            )
        except PasswordResetToken.DoesNotExist:
            raise serializers.ValidationError({"token": "Invalid or expired reset token."})

        if not reset_token.is_valid:
            raise serializers.ValidationError({"token": "This reset token has expired or already been used."})

        data["reset_token"] = reset_token
        return data

    def save(self):
        reset_token: PasswordResetToken = self.validated_data["reset_token"]
        user = reset_token.user
        user.set_password(self.validated_data["new_password"])
        # Also unlock the account if it was locked (admin-assisted recovery)
        user.is_locked = False
        user.failed_login_attempts = 0
        user.locked_at = None
        user.save(update_fields=["password", "is_locked", "failed_login_attempts", "locked_at"])

        reset_token.used = True
        reset_token.save(update_fields=["used"])

# Ambulance availability toggle

class AvailabilityToggleSerializer(serializers.ModelSerializer):
    # PATCH /me/availability/ — dispatcher sets Busy / Available.

    class Meta:
        model = User
        fields = ["is_available"]