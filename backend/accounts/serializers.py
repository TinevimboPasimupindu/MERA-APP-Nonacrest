# Registration and auth serializers for all three user roles.

# Patient registration
# Hospital registration (3-step)
# Ambulance service registration (3-step)
# Password reset request + confirm

import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from rest_framework import serializers

from .models import (
    AMBULANCE_ROLES,
    EmailOTP,
    HOSPITAL_ROLES,
    InstitutionalDocument,
    InstitutionalStatus,
    PasswordResetToken,
    Role,
    User,
)

# Guess-attempt cap on a single OTP code — see EmailOTP.attempts' comment
# in accounts/models.py for why this is per-code, not per-user/permanent.
OTP_MAX_VERIFY_ATTEMPTS = 5

# Shared helpers

def _validate_passwords(data: dict) -> dict:
    if data.get("password") != data.get("confirm_password"):
        raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
    return data


def _check_email_unique(email: str) -> None:
    if User.objects.filter(email=email).exists():
        raise serializers.ValidationError({"email": "An account with this email already exists."})


def _validate_successor(user_id, role_set, type_label):
    # Shared by HospitalAdminCreationSerializer/AmbulanceAdminCreationSerializer
    # for the optional `successor_of` reassignment field (see those classes).
    # Returns the resolved old account, or raises a field-level ValidationError.
    try:
        old_account = User.objects.get(id=user_id)
    except User.DoesNotExist:
        raise serializers.ValidationError({"successor_of": "That account does not exist."})
    if old_account.role not in role_set:
        raise serializers.ValidationError(
            {"successor_of": f"That account is not a {type_label} account."}
        )
    if old_account.is_active:
        raise serializers.ValidationError(
            {"successor_of": "That account must be deactivated before a successor can take it over."}
        )
    return old_account

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

# Google Sign-In (patients only — see "Key principle: only Patients
# self-register" in PROJECT_CONTEXT.md. This is an alternative to
# email/password for that same self-registration flow, not a new way for
# any other role to get an account.)

def _accepted_google_client_ids() -> set:
    return {
        cid for cid in (settings.GOOGLE_WEB_CLIENT_ID, settings.GOOGLE_IOS_CLIENT_ID) if cid
    }


def _verify_google_id_token(token: str) -> dict:
    # Server-side verification via Google's own library (google-auth) —
    # never trust a client-supplied token blindly. verify_oauth2_token
    # validates the cryptographic signature against Google's published
    # public keys (fetched over the network via the google_requests.Request
    # transport), the issuer, and expiry. audience=None here deliberately
    # skips verify_oauth2_token's own single-audience check — the `aud`
    # claim is checked manually below against a *set* of this app's client
    # ids instead (Google's own documented pattern for apps with multiple
    # platform clients: https://developers.google.com/identity/sign-in/web/backend-auth).
    #
    # Multiple client ids matter here, not just the Web one: this app's
    # dev workflow is plain Expo Go (no dev-client/EAS build), and
    # expo-auth-session/providers/google's client-id selection is keyed on
    # Platform.select({ios: 'iosClientId', ..., default: 'webClientId'})
    # — i.e. Platform.OS, not "is this a standalone build" (confirmed by
    # reading the installed library's source, not assumed). Expo Go on an
    # iOS device/simulator reports Platform.OS === 'ios', so a real iOS
    # test mints a token audienced to GOOGLE_IOS_CLIENT_ID, not the Web
    # one — a Web-only check would reject every real iOS sign-in attempt.
    try:
        idinfo = google_id_token.verify_oauth2_token(
            token, google_requests.Request(), audience=None,
        )
    except Exception:  # noqa: BLE001 — mirrors emergencies/services.py's broad-except handling of external API/token failures; any failure here (bad signature, expired, malformed token, network error fetching Google's certs) means "don't trust this token"
        raise serializers.ValidationError({"id_token": "Invalid or expired Google token."})

    accepted = _accepted_google_client_ids()
    if not accepted or idinfo.get("aud") not in accepted:
        raise serializers.ValidationError({"id_token": "Invalid or expired Google token."})
    if not idinfo.get("email_verified", False):
        raise serializers.ValidationError({"id_token": "Google account email is not verified."})
    if not idinfo.get("email"):
        raise serializers.ValidationError({"id_token": "Google token did not include an email address."})
    return idinfo


class GoogleSignInSerializer(serializers.Serializer):
    # Deliberately thin — just verifies the token and exposes the decoded
    # claims via .google_payload for the view to read after is_valid().
    # The actual link/create/reject decision lives in GoogleSignInView
    # (accounts/views.py) rather than here, matching how LoginView already
    # does all of its own branching directly in the view rather than
    # delegating to a serializer — this endpoint is fundamentally a login
    # action (with an optional account-creation side effect), not a
    # straightforward "validate input, create one model instance" case a
    # ModelSerializer.create() fits naturally.
    id_token = serializers.CharField(write_only=True)

    def validate_id_token(self, value):
        self._google_payload = _verify_google_id_token(value)
        return value

    @property
    def google_payload(self) -> dict:
        return self._google_payload

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

# Institution-identity fields — copied verbatim from the old account onto the
# new one when `successor_of` is used (see HospitalAdminCreationSerializer
# below). Deliberately excludes email/admin_contact_name/admin_phone/
# phone_number/password — those belong to the new admin as a person, not to
# the institution, and are never inherited from whoever ran it before.
HOSPITAL_IDENTITY_FIELDS = [
    "facility_name",
    "facility_type",
    "facility_registration_number",
    "official_address",
    "province",
    "has_emergency_unit",
    "visiting_hours",
    "latitude",
    "longitude",
]


class HospitalAdminCreationSerializer(serializers.ModelSerializer):
    # Used by MERA admin to create a hospital_admin account directly.
    # No terms_consent (that's a self-registration artifact) and no
    # PENDING approval step — MERA already vetted the institution before
    # creating this account, so it's active and approved immediately.
    #
    # Optional `successor_of`: the id of an existing, DEACTIVATED
    # hospital/hospital_admin account this new account is taking over for
    # (e.g. the previous admin left and MERA is onboarding a replacement for
    # the same physical hospital). When given, HOSPITAL_IDENTITY_FIELDS are
    # copied from that old account onto this one — any values for those
    # specific fields in this request are ignored in favor of the old
    # account's, since the whole point is continuity of the institution's
    # identity. The old account itself is left exactly as it was (still
    # deactivated, still in the database) — historical records referencing
    # it (Incidents, VerificationRequests) are never touched. Hospitals have
    # no subordinate accounts, so unlike the ambulance version of this field,
    # there's nothing else to re-link.

    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)
    successor_of = serializers.UUIDField(required=False, allow_null=True, write_only=True)

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
            "successor_of",
        ]

    def validate_email(self, value):
        _check_email_unique(value)
        return value

    def validate(self, data):
        _validate_passwords(data)
        if data.get("successor_of"):
            data["_old_account"] = _validate_successor(data["successor_of"], HOSPITAL_ROLES, "hospital")
        return data

    def create(self, validated_data):
        validated_data.pop("confirm_password")
        validated_data.pop("successor_of", None)
        old_account = validated_data.pop("_old_account", None)

        if old_account:
            for field in HOSPITAL_IDENTITY_FIELDS:
                validated_data[field] = getattr(old_account, field)

        return User.objects.create_user(
            role=Role.HOSPITAL_ADMIN,
            institutional_status=InstitutionalStatus.APPROVED,
            is_active=True,
            **validated_data,
        )

# MERA Admin: create Ambulance Admin account (institutional onboarding)

# See HOSPITAL_IDENTITY_FIELDS above for the reasoning — same idea, ambulance
# side. dispatch_phone/dispatch_address are the *service's* line/address
# (institution-level), not the admin's personal contact info, so they belong
# here, not with admin_contact_name/admin_phone.
AMBULANCE_IDENTITY_FIELDS = [
    "service_name",
    "service_type",
    "dispatch_phone",
    "dispatch_address",
    "operational_areas",
    "capabilities",
    "number_of_active_ambulances",
    "preferred_hospitals",
]


class AmbulanceAdminCreationSerializer(serializers.ModelSerializer):
    # Used by MERA admin to create an ambulance_admin account directly.
    # Same reasoning as HospitalAdminCreationSerializer above.
    #
    # Optional `successor_of`: same idea as the hospital version, but
    # ambulance services have subordinate EMT accounts — so on top of
    # copying AMBULANCE_IDENTITY_FIELDS from the old account, every EMT
    # currently linked to the old account's `ambulance_service` FK is
    # re-pointed at this new account AND reactivated (is_active=True) in the
    # same update — that's the actual point of reassignment: this new admin
    # can use these EMTs again, not just "they technically point at the
    # right account but still can't log in until someone remembers to run a
    # second step." See ReactivateUserView for the standalone version of
    # this same reasoning. Historical Incidents/VerificationRequests still
    # pointing at the old account are never touched.

    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)
    successor_of = serializers.UUIDField(required=False, allow_null=True, write_only=True)

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
            "successor_of",
        ]

    def validate_email(self, value):
        _check_email_unique(value)
        return value

    def validate(self, data):
        _validate_passwords(data)
        if data.get("successor_of"):
            data["_old_account"] = _validate_successor(data["successor_of"], AMBULANCE_ROLES, "ambulance")
        return data

    def create(self, validated_data):
        validated_data.pop("confirm_password")
        validated_data.pop("successor_of", None)
        old_account = validated_data.pop("_old_account", None)

        if old_account:
            for field in AMBULANCE_IDENTITY_FIELDS:
                validated_data[field] = getattr(old_account, field)

        new_user = User.objects.create_user(
            role=Role.AMBULANCE_ADMIN,
            institutional_status=InstitutionalStatus.APPROVED,
            is_active=True,
            **validated_data,
        )

        if old_account:
            User.objects.filter(ambulance_service=old_account, role=Role.EMT).update(
                ambulance_service=new_user, is_active=True,
            )

        return new_user

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
            "full_name",
            "phone_number",
            "institutional_status",
            "is_available",      # ambulance only
            "is_locked",
        ]
        read_only_fields = fields

    def get_display_name(self, obj):
        return obj.get_display_name()

# MERA Admin: institutions table (hospital_admin + ambulance_admin accounts)

class InstitutionSummarySerializer(serializers.ModelSerializer):
    # is_active added alongside institutional_status (a different field —
    # approved/pending/rejected vs. active/deactivated) so the web
    # frontend's shared row-actions menu can tell whether an institution is
    # currently deactivated and show "Reactivate" instead of "Deactivate"
    # accordingly. Without it, every row looked active regardless of its
    # real state.

    display_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "display_name", "role", "email", "is_active", "institutional_status", "date_joined"]
        read_only_fields = fields

    def get_display_name(self, obj):
        return obj.get_display_name()

# MERA Admin: edit any user's basic info

class AdminUserEditSerializer(serializers.ModelSerializer):
    # PATCH /auth/admin/users/{id}/ — MERA admin editing any account's basic
    # contact/identity info. Deliberately excludes role (permanent after
    # creation everywhere else in this codebase too) and password (goes
    # through the password-reset flow instead). facility_name/service_name
    # are included alongside the patient/EMT-style fields since a single
    # User row holds every role's fields regardless of which role it
    # actually is (see the model's own comment on this) — whichever of these
    # is relevant to the account being edited is the caller's concern, same
    # as EMTUpdateSerializer already does one level down for ambulance admins.

    class Meta:
        model = User
        fields = ["full_name", "email", "phone_number", "facility_name", "service_name"]

    def validate_email(self, value):
        if User.objects.exclude(pk=self.instance.pk).filter(email=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

# MERA Admin: platform-wide account management table (every role)

class AdminUserListSerializer(serializers.ModelSerializer):
    # display_name is a computed fallback (facility_name.strip() or email,
    # etc. — see User.get_full_name()), NOT the same thing as the raw name
    # field. The web frontend's Edit-user modal (AdminUserEditSerializer)
    # needs the actual full_name/facility_name/service_name/phone_number
    # values to safely prefill its form — prefilling from display_name alone
    # risks silently writing an email address into facility_name (whenever
    # the real field was blank and display_name fell back to email) or
    # blanking phone_number entirely (never exposed here before, so the
    # frontend had no way to know the current value before overwriting it).

    display_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "display_name", "role", "email", "is_active", "institutional_status", "date_joined",
            "full_name", "phone_number", "facility_name", "service_name",
        ]
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

        # In production, send this via email. If/when this gets wired up,
        # it must go through Brevo's HTTP API the same way accounts/views.py
        # ::_send_otp_email does — NOT django.core.mail.send_mail/Django's
        # SMTP EmailBackend. Render's free tier blocks all outbound SMTP
        # ports platform-wide (25/465/587), so an SMTP-based send cannot
        # work on this host regardless of credentials — this bit the OTP
        # feature for real (see PROJECT_CONTEXT.md) before Brevo replaced
        # it there. The frontend deep-links to: mera://reset-password?token=<token_value>
        # For now, the token is available via the admin or a separate email task.
        # TODO: wire up Brevo email sending here.


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

# Email OTP verification — second factor after email/password (patients
# only, see LoginView). Deliberately a serializer rather than logic
# inlined in the view (unlike GoogleSignInView, which is closer to plain
# credential-checking) — this is a "verify a stored code, act on it" case,
# the same shape as PasswordResetConfirmSerializer just above, and that's
# the closer precedent to follow here.

class VerifyOTPSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    code = serializers.CharField(min_length=6, max_length=6)

    def validate(self, data):
        # Same generic message regardless of *why* verification failed
        # (no such user, no live code, wrong code, too many attempts) —
        # mirrors LoginView's own "Invalid credentials" anti-enumeration
        # convention rather than telling a caller which part was wrong.
        generic_error = {"detail": "Invalid or expired code."}

        try:
            user = User.objects.get(id=data["user_id"], role=Role.PATIENT)
        except User.DoesNotExist:
            raise serializers.ValidationError(generic_error)

        otp = (
            EmailOTP.objects.filter(user=user, used=False)
            .order_by("-created_at")
            .first()
        )
        if otp is None or not otp.is_valid:
            raise serializers.ValidationError(generic_error)

        if otp.attempts >= OTP_MAX_VERIFY_ATTEMPTS:
            # Burn this code outright rather than leaving it live to keep
            # counting attempts forever — recovery is "request a new one"
            # (ResendOTPView), not something this endpoint can fix.
            otp.used = True
            otp.save(update_fields=["used"])
            raise serializers.ValidationError(
                {"detail": "Too many incorrect attempts. Please request a new code."}
            )

        if otp.code != data["code"]:
            otp.attempts += 1
            otp.save(update_fields=["attempts"])
            raise serializers.ValidationError(generic_error)

        otp.used = True
        otp.save(update_fields=["used"])
        data["user"] = user
        return data

# Ambulance availability toggle

class AvailabilityToggleSerializer(serializers.ModelSerializer):
    # PATCH /me/availability/ — dispatcher sets Busy / Available.

    class Meta:
        model = User
        fields = ["is_available"]