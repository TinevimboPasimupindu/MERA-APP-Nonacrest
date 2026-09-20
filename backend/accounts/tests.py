# Tests for user registration, login, password reset, and role-based access.


import uuid
from datetime import timedelta
from unittest.mock import Mock, patch

import requests
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle

from emergencies.models import Incident, IncidentStatus
from .models import EmailOTP, InstitutionalStatus, PasswordResetToken, Role, User


def _hospital_docs():
    # The two required onboarding documents HospitalAdminCreationSerializer
    # now rejects account creation without — see
    # RequiredInstitutionDocumentsTest for the tests that actually exercise
    # that requirement. Every other test that creates a hospital_admin
    # through the API (e.g. InstitutionReassignmentTest) needs these merged
    # into its payload too, purely so it keeps testing what it was already
    # testing rather than tripping over an unrelated "missing file" error.
    return {
        "health_facility_certificate": SimpleUploadedFile(
            "certificate.pdf", b"fake-pdf-bytes", content_type="application/pdf"
        ),
        "cipc_registration_document": SimpleUploadedFile(
            "cipc.pdf", b"fake-pdf-bytes", content_type="application/pdf"
        ),
    }


def _ambulance_docs():
    # Ambulance-side equivalent of _hospital_docs() above.
    return {
        "ems_operating_license": SimpleUploadedFile(
            "license.pdf", b"fake-pdf-bytes", content_type="application/pdf"
        ),
        "hpcsa_doh_registration_document": SimpleUploadedFile(
            "hpcsa.pdf", b"fake-pdf-bytes", content_type="application/pdf"
        ),
    }


class PatientRegistrationTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = reverse("register-patient")

    def test_successful_registration(self):
        data = {
            "full_name": "Thabo Mokoena",
            "email": "thabo@example.com",
            "phone_number": "+27821234567",
            "password": "SecurePass123!",
            "confirm_password": "SecurePass123!",
            "popi_consent": True,
            "terms_consent": True,
        }
        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("access", response.data)
        user = User.objects.get(email="thabo@example.com")
        self.assertEqual(user.role, Role.PATIENT)
        self.assertEqual(user.institutional_status, InstitutionalStatus.APPROVED)

    def test_duplicate_email_rejected(self):
        User.objects.create_user(email="thabo@example.com", password="pass", role=Role.PATIENT)
        data = {
            "full_name": "Thabo 2",
            "email": "thabo@example.com",
            "phone_number": "+27821234568",
            "password": "SecurePass123!",
            "confirm_password": "SecurePass123!",
            "popi_consent": True,
            "terms_consent": True,
        }
        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_popi_consent_required(self):
        data = {
            "full_name": "Naledi Sithole",
            "email": "naledi@example.com",
            "phone_number": "+27829876543",
            "password": "SecurePass123!",
            "confirm_password": "SecurePass123!",
            "popi_consent": False,
            "terms_consent": True,
        }
        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_terms_consent_required(self):
        data = {
            "full_name": "Sipho Dlamini",
            "email": "sipho@example.com",
            "phone_number": "+27831234567",
            "password": "SecurePass123!",
            "confirm_password": "SecurePass123!",
            "popi_consent": True,
            "terms_consent": False,
        }
        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_consent_fields_missing_entirely_rejected(self):
        data = {
            "full_name": "Zanele Khumalo",
            "email": "zanele@example.com",
            "phone_number": "+27837654321",
            "password": "SecurePass123!",
            "confirm_password": "SecurePass123!",
        }
        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class LoginTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = reverse("login")
        self.user = User.objects.create_user(
            email="patient@example.com",
            password="TestPass123!",
            role=Role.PATIENT,
            full_name="Test Patient",
        )

    @patch("accounts.views.requests.post")
    def test_successful_login_requires_otp_for_patient(self, mock_post):
        # Patients now get an OTP-required response instead of tokens
        # directly — see EmailOTPLoginTest below for the full two-step
        # round trip (login -> verify-otp). Brevo's send is mocked here
        # purely so this test doesn't depend on a real network call for
        # something it isn't actually testing (email delivery specifics
        # belong to EmailOTPLoginTest).
        mock_post.return_value = Mock(status_code=201, raise_for_status=Mock())
        response = self.client.post(self.url, {
            "email": "patient@example.com",
            "password": "TestPass123!",
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get("otp_required"))
        self.assertEqual(response.data.get("user_id"), str(self.user.id))
        self.assertNotIn("access", response.data)
        self.assertNotIn("refresh", response.data)

    def test_wrong_password_increments_counter(self):
        self.client.post(self.url, {"email": "patient@example.com", "password": "wrong"})
        self.user.refresh_from_db()
        self.assertEqual(self.user.failed_login_attempts, 1)

    def test_account_locked_after_five_failures(self):
        for _ in range(5):
            self.client.post(self.url, {"email": "patient@example.com", "password": "wrong"})
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_locked)
        response = self.client.post(self.url, {
            "email": "patient@example.com",
            "password": "TestPass123!",
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_pending_institutional_account_blocked(self):
        hospital = User.objects.create_user(
            email="hospital@example.com",
            password="TestPass123!",
            role=Role.HOSPITAL,
            institutional_status=InstitutionalStatus.PENDING,
            is_active=False,
            facility_name="Test Hospital",
        )
        response = self.client.post(self.url, {
            "email": "hospital@example.com",
            "password": "TestPass123!",
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


@override_settings(GOOGLE_WEB_CLIENT_ID="test-web-client-id", GOOGLE_IOS_CLIENT_ID="test-ios-client-id")
class GoogleSignInTest(TestCase):
    # The real Google verification call is never hit in tests —
    # accounts.serializers.google_id_token.verify_oauth2_token is mocked
    # directly (same approach emergencies/tests.py uses for the Routes API:
    # mock the one line that actually calls the external service, not the
    # whole HTTP stack), so no network call happens and no real Google
    # client/credentials are needed to run this suite. GOOGLE_WEB_CLIENT_ID/
    # GOOGLE_IOS_CLIENT_ID are overridden here the same way RouteEndpointTest
    # overrides GOOGLE_MAPS_API_KEY, since the real dev .env may not have
    # them set.

    def setUp(self):
        self.client = APIClient()
        self.url = reverse("google-signin")

    def _mock_payload(self, email="newpatient@example.com", name="New Patient", email_verified=True):
        return {
            "email": email,
            "email_verified": email_verified,
            "name": name,
            "sub": "1234567890",
            "aud": "test-web-client-id",
            "iss": "accounts.google.com",
        }

    @patch("accounts.serializers.google_id_token.verify_oauth2_token")
    def test_new_account_created_with_consent(self, mock_verify):
        mock_verify.return_value = self._mock_payload()
        response = self.client.post(self.url, {
            "id_token": "fake-token",
            "popi_consent": True,
            "terms_consent": True,
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("access", response.data)
        user = User.objects.get(email="newpatient@example.com")
        self.assertEqual(user.role, Role.PATIENT)
        self.assertEqual(user.full_name, "New Patient")
        self.assertEqual(user.institutional_status, InstitutionalStatus.APPROVED)
        # Google-authenticated account — no password to check, and
        # verifying nothing was ever set that would make one usable.
        self.assertFalse(user.has_usable_password())

    @patch("accounts.serializers.google_id_token.verify_oauth2_token")
    def test_new_account_requires_consent(self, mock_verify):
        mock_verify.return_value = self._mock_payload(email="noconsent@example.com")
        response = self.client.post(self.url, {"id_token": "fake-token"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(response.data.get("needs_registration"))
        self.assertFalse(User.objects.filter(email="noconsent@example.com").exists())

    @patch("accounts.serializers.google_id_token.verify_oauth2_token")
    def test_links_to_existing_patient_account(self, mock_verify):
        existing = User.objects.create_user(
            email="existingpatient@example.com",
            password="SomePassword123!",
            role=Role.PATIENT,
            full_name="Existing Patient",
        )
        mock_verify.return_value = self._mock_payload(email="existingpatient@example.com")
        response = self.client.post(self.url, {"id_token": "fake-token"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertEqual(response.data["user"]["id"], str(existing.id))
        # No duplicate account created for the same email.
        self.assertEqual(User.objects.filter(email="existingpatient@example.com").count(), 1)

    @patch("accounts.serializers.google_id_token.verify_oauth2_token")
    def test_rejects_existing_non_patient_role(self, mock_verify):
        User.objects.create_user(
            email="ambulance@example.com",
            password="SomePassword123!",
            role=Role.AMBULANCE_SERVICE,
            service_name="Test EMS",
        )
        mock_verify.return_value = self._mock_payload(email="ambulance@example.com")
        response = self.client.post(self.url, {"id_token": "fake-token"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertNotIn("access", response.data)

    @patch("accounts.serializers.google_id_token.verify_oauth2_token")
    def test_rejects_deactivated_existing_patient(self, mock_verify):
        User.objects.create_user(
            email="deactivated@example.com",
            password="SomePassword123!",
            role=Role.PATIENT,
            is_active=False,
        )
        mock_verify.return_value = self._mock_payload(email="deactivated@example.com")
        response = self.client.post(self.url, {"id_token": "fake-token"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @patch("accounts.serializers.google_id_token.verify_oauth2_token")
    def test_rejects_invalid_or_unverifiable_token(self, mock_verify):
        mock_verify.side_effect = ValueError("Token used too late")
        response = self.client.post(self.url, {"id_token": "garbage"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(User.objects.count(), 0)

    @patch("accounts.serializers.google_id_token.verify_oauth2_token")
    def test_accepts_ios_client_id_audience(self, mock_verify):
        # A token minted via the iOS client (what Expo Go on a real iOS
        # device actually produces — see the reasoning note in
        # accounts/serializers.py::_verify_google_id_token) must be
        # accepted, not just a Web-client-audienced token.
        payload = self._mock_payload(email="iosuser@example.com")
        payload["aud"] = "test-ios-client-id"
        mock_verify.return_value = payload
        response = self.client.post(self.url, {
            "id_token": "fake-token",
            "popi_consent": True,
            "terms_consent": True,
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(email="iosuser@example.com").exists())

    @patch("accounts.serializers.google_id_token.verify_oauth2_token")
    def test_rejects_token_for_unrecognized_client(self, mock_verify):
        # A token that's otherwise well-formed but wasn't minted for this
        # app at all (some other Google client) must not be accepted.
        payload = self._mock_payload()
        payload["aud"] = "some-other-apps-client-id"
        mock_verify.return_value = payload
        response = self.client.post(self.url, {
            "id_token": "fake-token",
            "popi_consent": True,
            "terms_consent": True,
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(User.objects.count(), 0)

    @patch("accounts.serializers.google_id_token.verify_oauth2_token")
    def test_rejects_unverified_email(self, mock_verify):
        mock_verify.return_value = self._mock_payload(email_verified=False)
        response = self.client.post(self.url, {
            "id_token": "fake-token",
            "popi_consent": True,
            "terms_consent": True,
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(User.objects.count(), 0)

    def test_missing_token_rejected(self):
        response = self.client.post(self.url, {})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


@override_settings(BREVO_API_KEY="test-brevo-key", BREVO_SENDER_EMAIL="noreply@test.mera.example")
class EmailOTPLoginTest(TestCase):
    # Second factor on top of login — originally patient-only, extended to
    # EMT too (see EMTEmailOTPLoginTest below and accounts/models.py::
    # OTP_REQUIRED_ROLES). This class exercises the mechanism itself
    # (generation, rate limiting, guess-attempt capping, delivery failure)
    # against a patient fixture; EMTEmailOTPLoginTest doesn't repeat all of
    # that (the mechanism doesn't branch on role), just the three code
    # paths that actually changed for EMT.
    # The real Brevo API is never hit in tests — accounts.views.requests.post
    # is mocked directly, same approach emergencies/tests.py already uses
    # for the Google Routes API (mock the one line that calls the external
    # service, not the whole HTTP stack). BREVO_API_KEY/BREVO_SENDER_EMAIL
    # are supplied via @override_settings for the same reason
    # GOOGLE_MAPS_API_KEY/GOOGLE_WEB_CLIENT_ID are elsewhere — the real dev
    # .env may not have them set.

    def setUp(self):
        self.client = APIClient()
        self.login_url = reverse("login")
        self.verify_url = reverse("verify-otp")
        self.resend_url = reverse("resend-otp")
        self.user = User.objects.create_user(
            email="otp-patient@example.com",
            password="TestPass123!",
            role=Role.PATIENT,
            full_name="OTP Patient",
        )

        # Successful Brevo response by default — individual tests override
        # self.mock_post.return_value/side_effect to exercise failure paths.
        patcher = patch("accounts.views.requests.post")
        self.mock_post = patcher.start()
        self.addCleanup(patcher.stop)
        self.mock_post.return_value = Mock(status_code=201, raise_for_status=Mock())

    def _login(self):
        return self.client.post(self.login_url, {
            "email": "otp-patient@example.com",
            "password": "TestPass123!",
        })

    def test_login_sends_otp_instead_of_tokens(self):
        response = self._login()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get("otp_required"))
        self.assertEqual(response.data.get("user_id"), str(self.user.id))
        self.assertNotIn("access", response.data)

        self.assertEqual(self.mock_post.call_count, 1)
        call = self.mock_post.call_args
        self.assertEqual(call.args[0], "https://api.brevo.com/v3/smtp/email")
        self.assertEqual(call.kwargs["headers"]["api-key"], "test-brevo-key")
        self.assertEqual(call.kwargs["json"]["to"], [{"email": "otp-patient@example.com"}])
        self.assertEqual(call.kwargs["json"]["sender"], {"email": "noreply@test.mera.example"})
        # The reasonable timeout the task called for — this is exactly the
        # gap that let the earlier Gmail SMTP call hang indefinitely.
        self.assertEqual(call.kwargs["timeout"], 10.0)

        otp = EmailOTP.objects.get(user=self.user, used=False)
        self.assertEqual(len(otp.code), 6)
        self.assertTrue(otp.code.isdigit())
        self.assertIn(otp.code, call.kwargs["json"]["textContent"])

    def test_otp_delivery_failure_returns_503_and_leaves_existing_code_usable(self):
        # First, a real successful login/code (this is what a patient would
        # already have in hand if a later resend then fails).
        self._login()
        original_otp = EmailOTP.objects.get(user=self.user, used=False)

        # Now Brevo fails on the next attempt (timeout, connection error,
        # DNS failure — requests.RequestException covers all of these the
        # same way).
        self.mock_post.side_effect = requests.exceptions.Timeout("Brevo took too long")
        response = self.client.post(self.resend_url, {"user_id": str(self.user.id)})

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertNotIn("otp_required", response.data)

        # Send-before-persist: a failed delivery must not invalidate the
        # code the patient already has, and must not leave behind a row
        # for a code that was never actually sent.
        original_otp.refresh_from_db()
        self.assertFalse(original_otp.used)
        self.assertEqual(EmailOTP.objects.filter(user=self.user, used=False).count(), 1)

    def test_otp_delivery_http_error_returns_503(self):
        # A non-2xx response from Brevo (e.g. bad API key, invalid sender)
        # surfaces via raise_for_status() — covered separately from the
        # network-level Timeout case above since it's a different code path
        # through _send_otp_email's except clause.
        error_response = Mock(status_code=401)
        error_response.raise_for_status.side_effect = requests.exceptions.HTTPError(
            "401 Unauthorized", response=error_response
        )
        self.mock_post.return_value = error_response

        response = self._login()
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(EmailOTP.objects.filter(user=self.user).count(), 0)

    def test_correct_otp_returns_tokens(self):
        self._login()
        otp = EmailOTP.objects.get(user=self.user, used=False)

        response = self.client.post(self.verify_url, {
            "user_id": str(self.user.id),
            "code": otp.code,
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        otp.refresh_from_db()
        self.assertTrue(otp.used)

    def test_wrong_code_rejected(self):
        self._login()
        otp = EmailOTP.objects.get(user=self.user, used=False)
        wrong_code = "000000" if otp.code != "000000" else "111111"

        response = self.client.post(self.verify_url, {
            "user_id": str(self.user.id),
            "code": wrong_code,
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        otp.refresh_from_db()
        self.assertEqual(otp.attempts, 1)
        self.assertFalse(otp.used)

    def test_expired_code_rejected(self):
        self._login()
        otp = EmailOTP.objects.get(user=self.user, used=False)
        otp.expires_at = timezone.now() - timedelta(minutes=1)
        otp.save(update_fields=["expires_at"])

        response = self.client.post(self.verify_url, {
            "user_id": str(self.user.id),
            "code": otp.code,
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_already_used_code_rejected(self):
        self._login()
        otp = EmailOTP.objects.get(user=self.user, used=False)
        data = {"user_id": str(self.user.id), "code": otp.code}

        first = self.client.post(self.verify_url, data)
        self.assertEqual(first.status_code, status.HTTP_200_OK)

        second = self.client.post(self.verify_url, data)
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)

    def test_guess_attempts_cap_burns_the_code(self):
        # After enough wrong guesses, even the *correct* code stops
        # working — the live code is burned outright, forcing a resend,
        # rather than leaving it guessable indefinitely.
        self._login()
        otp = EmailOTP.objects.get(user=self.user, used=False)
        wrong_code = "000000" if otp.code != "000000" else "111111"

        for _ in range(5):
            self.client.post(self.verify_url, {"user_id": str(self.user.id), "code": wrong_code})

        response = self.client.post(self.verify_url, {
            "user_id": str(self.user.id),
            "code": otp.code,
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_generation_rate_limit_blocks_excess_logins(self):
        # 3 logins (each generates a code) succeed; the 4th, still inside
        # the same window, is rate-limited rather than sending a 4th email.
        for _ in range(3):
            response = self._login()
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertTrue(response.data.get("otp_required"))

        fourth = self._login()
        self.assertEqual(fourth.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(self.mock_post.call_count, 3)

    def test_resend_issues_a_new_code_and_invalidates_the_old_one(self):
        self._login()
        first_otp = EmailOTP.objects.get(user=self.user, used=False)

        response = self.client.post(self.resend_url, {"user_id": str(self.user.id)})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get("otp_required"))
        self.assertEqual(self.mock_post.call_count, 2)

        first_otp.refresh_from_db()
        self.assertTrue(first_otp.used)  # invalidated by the resend

        new_otp = EmailOTP.objects.get(user=self.user, used=False)
        self.assertNotEqual(new_otp.id, first_otp.id)

        verify = self.client.post(self.verify_url, {
            "user_id": str(self.user.id),
            "code": new_otp.code,
        })
        self.assertEqual(verify.status_code, status.HTTP_200_OK)

    def test_resend_also_subject_to_generation_rate_limit(self):
        # The limit is shared across login and resend — otherwise resend
        # would be an unthrottled bypass of the login-side limit.
        self._login()
        self.client.post(self.resend_url, {"user_id": str(self.user.id)})
        self.client.post(self.resend_url, {"user_id": str(self.user.id)})

        fourth = self.client.post(self.resend_url, {"user_id": str(self.user.id)})
        self.assertEqual(fourth.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_resend_with_invalid_user_id_rejected(self):
        response = self.client.post(self.resend_url, {"user_id": str(uuid.uuid4())})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_verify_otp_missing_fields_rejected(self):
        response = self.client.post(self.verify_url, {"user_id": str(self.user.id)})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_hospital_admin_login_unaffected_by_otp(self):
        # Scope boundary: OTP_REQUIRED_ROLES is {patient, EMT} — every
        # web-side role must keep logging in exactly as before, immediate
        # tokens, no OTP email. EMT moved to its own
        # EMTEmailOTPLoginTest below, since it's now IN scope, not out of
        # it — see accounts/models.py::OTP_REQUIRED_ROLES.
        User.objects.create_user(
            email="hospital-admin-otp-check@example.com",
            password="TestPass123!",
            role=Role.HOSPITAL_ADMIN,
            facility_name="Not An OTP Hospital",
        )
        response = self.client.post(self.login_url, {
            "email": "hospital-admin-otp-check@example.com",
            "password": "TestPass123!",
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertNotIn("otp_required", response.data)
        self.assertEqual(self.mock_post.call_count, 0)

    def test_ambulance_admin_login_unaffected_by_otp(self):
        User.objects.create_user(
            email="ambulance-admin-otp-check@example.com",
            password="TestPass123!",
            role=Role.AMBULANCE_ADMIN,
            service_name="Not An OTP EMS",
        )
        response = self.client.post(self.login_url, {
            "email": "ambulance-admin-otp-check@example.com",
            "password": "TestPass123!",
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertNotIn("otp_required", response.data)
        self.assertEqual(self.mock_post.call_count, 0)

    def test_mera_admin_login_unaffected_by_otp(self):
        User.objects.create_user(
            email="mera-admin-otp-check@example.com",
            password="TestPass123!",
            role=Role.MERA_ADMIN,
        )
        response = self.client.post(self.login_url, {
            "email": "mera-admin-otp-check@example.com",
            "password": "TestPass123!",
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertNotIn("otp_required", response.data)
        self.assertEqual(self.mock_post.call_count, 0)


@override_settings(BREVO_API_KEY="test-brevo-key", BREVO_SENDER_EMAIL="noreply@test.mera.example")
class EMTEmailOTPLoginTest(TestCase):
    # Extends the patient-only email OTP second factor (EmailOTPLoginTest
    # above) to EMT accounts too — see accounts/models.py::
    # OTP_REQUIRED_ROLES. Deliberately NOT a full duplicate of
    # EmailOTPLoginTest's 14 tests: the underlying generation/rate-limit/
    # guess-attempt mechanism (_generate_and_send_otp, VerifyOTPSerializer)
    # doesn't branch on role at all once the initial role__in lookup
    # resolves a user — that mechanism is already fully proven by the
    # patient test suite above and is untouched by this task. What
    # actually changed here is three specific role filters (LoginView,
    # ResendOTPView, VerifyOTPSerializer), so this class covers exactly
    # those three code paths for an EMT account, not the shared mechanism
    # a second time.

    def setUp(self):
        self.ambulance = User.objects.create_user(
            email="otp-emt-owner@example.com", password="pass", role=Role.AMBULANCE_ADMIN,
            service_name="OTP Test EMS",
        )
        self.client = APIClient()
        self.login_url = reverse("login")
        self.verify_url = reverse("verify-otp")
        self.resend_url = reverse("resend-otp")
        self.user = User.objects.create_user(
            email="otp-emt@example.com",
            password="TestPass123!",
            role=Role.EMT,
            full_name="OTP EMT",
            ambulance_service=self.ambulance,
        )

        patcher = patch("accounts.views.requests.post")
        self.mock_post = patcher.start()
        self.addCleanup(patcher.stop)
        self.mock_post.return_value = Mock(status_code=201, raise_for_status=Mock())

    def _login(self):
        return self.client.post(self.login_url, {
            "email": "otp-emt@example.com",
            "password": "TestPass123!",
        })

    def test_login_sends_otp_instead_of_tokens_for_emt(self):
        response = self._login()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get("otp_required"))
        self.assertEqual(response.data.get("user_id"), str(self.user.id))
        self.assertNotIn("access", response.data)

        self.assertEqual(self.mock_post.call_count, 1)
        call = self.mock_post.call_args
        self.assertEqual(call.kwargs["json"]["to"], [{"email": "otp-emt@example.com"}])

        otp = EmailOTP.objects.get(user=self.user, used=False)
        self.assertEqual(len(otp.code), 6)
        self.assertTrue(otp.code.isdigit())
        self.assertIn(otp.code, call.kwargs["json"]["textContent"])

    def test_correct_otp_returns_tokens_for_emt(self):
        self._login()
        otp = EmailOTP.objects.get(user=self.user, used=False)

        response = self.client.post(self.verify_url, {
            "user_id": str(self.user.id),
            "code": otp.code,
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertEqual(response.data["user"]["role"], "emt")
        otp.refresh_from_db()
        self.assertTrue(otp.used)

    def test_resend_works_for_emt(self):
        # This is the one that would have silently 404'd before the fix —
        # ResendOTPView's lookup was hardcoded to role=Role.PATIENT.
        self._login()
        first_otp = EmailOTP.objects.get(user=self.user, used=False)

        response = self.client.post(self.resend_url, {"user_id": str(self.user.id)})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get("otp_required"))

        first_otp.refresh_from_db()
        self.assertTrue(first_otp.used)
        new_otp = EmailOTP.objects.get(user=self.user, used=False)
        self.assertNotEqual(new_otp.id, first_otp.id)


class EMTUpdateDeleteTest(TestCase):
    # Ambulance admin editing/deactivating their own EMTs (and only their own).

    def setUp(self):
        self.ambulance = User.objects.create_user(
            email="amb@example.com", password="pass", role=Role.AMBULANCE_ADMIN,
            service_name="Test EMS",
        )
        self.other_ambulance = User.objects.create_user(
            email="other-amb@example.com", password="pass", role=Role.AMBULANCE_SERVICE,
            service_name="Other EMS",
        )
        self.emt = User.objects.create_user(
            email="emt@example.com", password="pass", role=Role.EMT,
            full_name="Test EMT", ambulance_service=self.ambulance,
        )
        self.other_emt = User.objects.create_user(
            email="other-emt@example.com", password="pass", role=Role.EMT,
            full_name="Other EMT", ambulance_service=self.other_ambulance,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.ambulance)

    def test_can_edit_own_emt(self):
        url = reverse("admin-emt-update", args=[self.emt.id])
        response = self.client.patch(url, {"full_name": "Updated Name"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.emt.refresh_from_db()
        self.assertEqual(self.emt.full_name, "Updated Name")

    def test_role_and_password_are_not_editable(self):
        url = reverse("admin-emt-update", args=[self.emt.id])
        response = self.client.patch(url, {"role": "mera_admin", "password": "newpass123"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.emt.refresh_from_db()
        self.assertEqual(self.emt.role, Role.EMT)
        self.assertTrue(self.emt.check_password("pass"))

    def test_cannot_edit_another_ambulances_emt(self):
        url = reverse("admin-emt-update", args=[self.other_emt.id])
        response = self.client.patch(url, {"full_name": "Hacked"})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.other_emt.refresh_from_db()
        self.assertEqual(self.other_emt.full_name, "Other EMT")

    def test_delete_deactivates_own_emt(self):
        url = reverse("admin-emt-update", args=[self.emt.id])
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.emt.refresh_from_db()
        self.assertFalse(self.emt.is_active)
        self.assertTrue(User.objects.filter(id=self.emt.id).exists())  # soft delete, still exists

    def test_cannot_deactivate_another_ambulances_emt(self):
        url = reverse("admin-emt-update", args=[self.other_emt.id])
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.other_emt.refresh_from_db()
        self.assertTrue(self.other_emt.is_active)


class MERAAdminInstitutionsStatsUsersTest(TestCase):
    # Institutions list, platform stats, all-users list, and deactivation.

    def setUp(self):
        self.mera_admin = User.objects.create_user(
            email="mera@example.com", password="pass", role=Role.MERA_ADMIN,
        )
        self.hospital = User.objects.create_user(
            email="hosp@example.com", password="pass", role=Role.HOSPITAL_ADMIN,
            facility_name="Test Hospital", institutional_status=InstitutionalStatus.APPROVED,
        )
        self.ambulance = User.objects.create_user(
            email="amb2@example.com", password="pass", role=Role.AMBULANCE_SERVICE,
            service_name="Test EMS", institutional_status=InstitutionalStatus.APPROVED,
        )
        self.patient = User.objects.create_user(
            email="pat@example.com", password="pass", role=Role.PATIENT, full_name="Test Patient",
        )
        self.emt = User.objects.create_user(
            email="emt2@example.com", password="pass", role=Role.EMT,
            full_name="Test EMT", ambulance_service=self.ambulance,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.mera_admin)

    def test_institutions_list_includes_both_old_and_new_role_names(self):
        response = self.client.get(reverse("admin-institutions"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        roles = {row["role"] for row in response.data}
        self.assertEqual(roles, {"hospital_admin", "ambulance_service"})

    def test_institutions_list_excludes_non_institutional_accounts(self):
        response = self.client.get(reverse("admin-institutions"))
        self.assertEqual(len(response.data), 2)

    def test_stats(self):
        response = self.client.get(reverse("admin-stats"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_patients"], 1)
        self.assertEqual(response.data["total_hospitals"], 1)
        self.assertEqual(response.data["total_ambulance_services"], 1)
        self.assertEqual(response.data["total_emts"], 1)
        self.assertEqual(response.data["total_incidents"], 0)

    def test_stats_only_counts_active_accounts(self):
        # The fixtures in setUp are all active, so test_stats above can't by
        # itself prove deactivated accounts are excluded — it would pass
        # identically whether or not the is_active filter existed. This
        # deactivates one of each role-based count and confirms each one
        # drops, while total_incidents (no active/inactive concept) is
        # unaffected by any of this.
        self.hospital.is_active = False
        self.hospital.save(update_fields=["is_active"])
        self.ambulance.is_active = False
        self.ambulance.save(update_fields=["is_active"])
        self.patient.is_active = False
        self.patient.save(update_fields=["is_active"])
        self.emt.is_active = False
        self.emt.save(update_fields=["is_active"])

        response = self.client.get(reverse("admin-stats"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_patients"], 0)
        self.assertEqual(response.data["total_hospitals"], 0)
        self.assertEqual(response.data["total_ambulance_services"], 0)
        self.assertEqual(response.data["total_emts"], 0)
        self.assertEqual(response.data["total_incidents"], 0)

    def test_all_users_list_returns_every_role(self):
        response = self.client.get(reverse("admin-users"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 5)

    def test_deactivate_any_account(self):
        url = reverse("admin-user-deactivate", args=[self.patient.id])
        response = self.client.patch(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.patient.refresh_from_db()
        self.assertFalse(self.patient.is_active)

    def test_cannot_deactivate_own_account(self):
        url = reverse("admin-user-deactivate", args=[self.mera_admin.id])
        response = self.client.patch(url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.mera_admin.refresh_from_db()
        self.assertTrue(self.mera_admin.is_active)

    def test_non_mera_admin_forbidden(self):
        self.client.force_authenticate(user=self.hospital)
        response = self.client.get(reverse("admin-institutions"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class SearchAndSortTest(TestCase):
    # ?search= on institutions/users lists, and active-first ordering on the
    # users list.

    def setUp(self):
        self.mera_admin = User.objects.create_user(
            email="mera-search@example.com", password="pass", role=Role.MERA_ADMIN,
        )
        self.hospital = User.objects.create_user(
            email="riverside@example.com", password="pass", role=Role.HOSPITAL_ADMIN,
            facility_name="Riverside Hospital",
        )
        self.ambulance = User.objects.create_user(
            email="speedy@example.com", password="pass", role=Role.AMBULANCE_ADMIN,
            service_name="Speedy EMS",
        )
        self.patient = User.objects.create_user(
            email="thandi@example.com", password="pass", role=Role.PATIENT,
            full_name="Thandi Nkosi",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.mera_admin)

    def test_institutions_search_matches_facility_name(self):
        response = self.client.get(reverse("admin-institutions"), {"search": "riverside"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["display_name"], "Riverside Hospital")

    def test_institutions_search_matches_service_name(self):
        response = self.client.get(reverse("admin-institutions"), {"search": "speedy"})
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["display_name"], "Speedy EMS")

    def test_institutions_search_matches_email(self):
        response = self.client.get(reverse("admin-institutions"), {"search": "riverside@example"})
        self.assertEqual(len(response.data), 1)

    def test_institutions_search_is_case_insensitive(self):
        response = self.client.get(reverse("admin-institutions"), {"search": "RIVERSIDE"})
        self.assertEqual(len(response.data), 1)

    def test_institutions_search_no_match_returns_empty(self):
        response = self.client.get(reverse("admin-institutions"), {"search": "nonexistent"})
        self.assertEqual(len(response.data), 0)

    def test_institutions_no_search_param_returns_all(self):
        response = self.client.get(reverse("admin-institutions"))
        self.assertEqual(len(response.data), 2)

    def test_users_search_matches_patient_full_name(self):
        response = self.client.get(reverse("admin-users"), {"search": "thandi"})
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["display_name"], "Thandi Nkosi")

    def test_users_search_matches_institution_across_roles(self):
        response = self.client.get(reverse("admin-users"), {"search": "speedy"})
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["role"], "ambulance_admin")

    def test_users_list_orders_active_before_inactive(self):
        self.hospital.is_active = False
        self.hospital.save(update_fields=["is_active"])
        response = self.client.get(reverse("admin-users"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        active_flags = [row["is_active"] for row in response.data]
        # Every True must appear before every False.
        self.assertEqual(active_flags, sorted(active_flags, key=lambda a: not a))


class CascadingDeactivationTest(TestCase):
    # Deactivating an ambulance_admin cascades to its EMTs; hospital_admin
    # has no subordinate accounts, so nothing cascades there.

    def setUp(self):
        self.mera_admin = User.objects.create_user(
            email="mera-cascade@example.com", password="pass", role=Role.MERA_ADMIN,
        )
        self.ambulance = User.objects.create_user(
            email="cascade-amb@example.com", password="pass", role=Role.AMBULANCE_ADMIN,
            service_name="Cascade EMS",
        )
        self.emt1 = User.objects.create_user(
            email="cascade-emt1@example.com", password="pass", role=Role.EMT,
            full_name="EMT One", ambulance_service=self.ambulance,
        )
        self.emt2 = User.objects.create_user(
            email="cascade-emt2@example.com", password="pass", role=Role.EMT,
            full_name="EMT Two", ambulance_service=self.ambulance,
        )
        self.already_inactive_emt = User.objects.create_user(
            email="cascade-emt3@example.com", password="pass", role=Role.EMT,
            full_name="EMT Three", ambulance_service=self.ambulance, is_active=False,
        )
        self.hospital = User.objects.create_user(
            email="cascade-hosp@example.com", password="pass", role=Role.HOSPITAL_ADMIN,
            facility_name="Cascade Hospital",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.mera_admin)

    def test_deactivating_ambulance_admin_deactivates_its_emts(self):
        url = reverse("admin-user-deactivate", args=[self.ambulance.id])
        response = self.client.patch(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.ambulance.refresh_from_db()
        self.emt1.refresh_from_db()
        self.emt2.refresh_from_db()
        self.assertFalse(self.ambulance.is_active)
        self.assertFalse(self.emt1.is_active)
        self.assertFalse(self.emt2.is_active)

    def test_response_reports_deactivated_emt_count_excluding_already_inactive(self):
        url = reverse("admin-user-deactivate", args=[self.ambulance.id])
        response = self.client.patch(url)
        self.assertEqual(response.data["deactivated_emt_count"], 2)

    def test_deactivating_hospital_admin_has_no_cascade(self):
        url = reverse("admin-user-deactivate", args=[self.hospital.id])
        response = self.client.patch(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["deactivated_emt_count"], 0)

    def test_other_ambulances_emts_unaffected(self):
        other_ambulance = User.objects.create_user(
            email="cascade-other-amb@example.com", password="pass", role=Role.AMBULANCE_ADMIN,
            service_name="Other EMS",
        )
        other_emt = User.objects.create_user(
            email="cascade-other-emt@example.com", password="pass", role=Role.EMT,
            full_name="Other EMT", ambulance_service=other_ambulance,
        )
        url = reverse("admin-user-deactivate", args=[self.ambulance.id])
        self.client.patch(url)
        other_emt.refresh_from_db()
        self.assertTrue(other_emt.is_active)


class InstitutionReassignmentTest(TestCase):
    # `successor_of` on the hospital/ambulance admin creation endpoints —
    # letting a new institution account take over a deactivated one.

    def setUp(self):
        self.mera_admin = User.objects.create_user(
            email="mera-reassign@example.com", password="pass", role=Role.MERA_ADMIN,
        )
        self.old_ambulance = User.objects.create_user(
            email="old-amb@example.com", password="pass", role=Role.AMBULANCE_ADMIN,
            service_name="Legacy EMS", service_type="private",
            dispatch_phone="0110000000", is_active=False,
        )
        # Realistically, this EMT would already be inactive — cascade-
        # deactivated when old_ambulance was deactivated (see
        # CascadingDeactivationTest). Setting it explicitly here (rather than
        # relying on a real cascade in setUp) keeps this fixture independent
        # and lets tests below prove reassignment reactivates it.
        self.emt = User.objects.create_user(
            email="legacy-emt@example.com", password="pass", role=Role.EMT,
            full_name="Legacy EMT", ambulance_service=self.old_ambulance,
            is_active=False,
        )
        self.old_hospital = User.objects.create_user(
            email="old-hosp@example.com", password="pass", role=Role.HOSPITAL_ADMIN,
            facility_name="Legacy Hospital", facility_type="public",
            official_address="1 Old Street", is_active=False,
        )
        self.patient = User.objects.create_user(
            email="reassign-patient@example.com", password="pass", role=Role.PATIENT,
            full_name="Test Patient",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.mera_admin)

        # Not what this test class is about — see
        # RequiredInstitutionDocumentsTest for that — but every hospital/
        # ambulance-admin creation call below now requires document uploads,
        # so the real Cloudinary API must never be hit here either.
        patcher = patch("accounts.serializers.cloudinary_upload")
        self.mock_cloudinary_upload = patcher.start()
        self.addCleanup(patcher.stop)
        self.mock_cloudinary_upload.return_value = {"secure_url": "https://res.cloudinary.com/test/doc.pdf"}

    def test_ambulance_reassignment_copies_identity_and_relinks_emts(self):
        url = reverse("admin-create-ambulance-admin")
        response = self.client.post(url, {
            "email": "new-amb@example.com",
            "password": "TestPass123!",
            "confirm_password": "TestPass123!",
            "admin_contact_name": "New Admin",
            "admin_phone": "0821111111",
            "successor_of": str(self.old_ambulance.id),
            **_ambulance_docs(),
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        new_ambulance = User.objects.get(email="new-amb@example.com")
        self.assertEqual(new_ambulance.service_name, "Legacy EMS")
        self.assertEqual(new_ambulance.service_type, "private")
        self.assertEqual(new_ambulance.dispatch_phone, "0110000000")
        self.assertTrue(new_ambulance.is_active)
        # The new admin's own contact info is theirs, not copied.
        self.assertEqual(new_ambulance.admin_contact_name, "New Admin")

        self.emt.refresh_from_db()
        self.assertEqual(self.emt.ambulance_service_id, new_ambulance.id)
        # Re-linking alone isn't the point — the EMT must actually be usable
        # again under the new account, not just correctly pointed at it.
        self.assertTrue(self.emt.is_active)

        # Old account is untouched — still deactivated, still in the DB,
        # still holding its own (now-historical) identity fields.
        self.old_ambulance.refresh_from_db()
        self.assertFalse(self.old_ambulance.is_active)
        self.assertEqual(self.old_ambulance.service_name, "Legacy EMS")

    def test_reassignment_does_not_reactivate_emts_already_active(self):
        # An EMT who (unusually) stayed active despite the old account being
        # deactivated shouldn't be affected either way — reassignment should
        # only ever move an EMT towards "usable", never touch one that
        # already is for some unrelated reason.
        already_active_emt = User.objects.create_user(
            email="already-active-emt@example.com", password="pass", role=Role.EMT,
            full_name="Already Active EMT", ambulance_service=self.old_ambulance,
            is_active=True,
        )
        url = reverse("admin-create-ambulance-admin")
        response = self.client.post(url, {
            "email": "new-amb7@example.com",
            "password": "TestPass123!",
            "confirm_password": "TestPass123!",
            "successor_of": str(self.old_ambulance.id),
            **_ambulance_docs(),
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        already_active_emt.refresh_from_db()
        self.assertTrue(already_active_emt.is_active)

    @patch("accounts.views.requests.post")
    def test_reactivated_emt_can_actually_log_in_after_reassignment(self, mock_post):
        # The real check the reassignment flow is supposed to deliver on:
        # not just an is_active flag flip, but genuine restored access.
        # Confirm login is actually rejected beforehand too, so this proves
        # reassignment *changed* something rather than login having always
        # worked regardless of is_active.
        #
        # EMT logins now reach the email-OTP branch (OTP_REQUIRED_ROLES —
        # see accounts/models.py), so Brevo's send is mocked here — this
        # test is about reassignment restoring access, not email delivery,
        # and "restored access" now means reaching the OTP step rather
        # than getting a 403, not skipping straight to tokens.
        mock_post.return_value = Mock(status_code=201, raise_for_status=Mock())
        login_url = reverse("login")

        before = self.client.post(login_url, {
            "email": "legacy-emt@example.com", "password": "pass",
        })
        self.assertEqual(before.status_code, status.HTTP_403_FORBIDDEN)

        reassign_url = reverse("admin-create-ambulance-admin")
        response = self.client.post(reassign_url, {
            "email": "new-amb8@example.com",
            "password": "TestPass123!",
            "confirm_password": "TestPass123!",
            "successor_of": str(self.old_ambulance.id),
            **_ambulance_docs(),
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        after = self.client.post(login_url, {
            "email": "legacy-emt@example.com", "password": "pass",
        })
        self.assertEqual(after.status_code, status.HTTP_200_OK)
        self.assertTrue(after.data.get("otp_required"))
        self.assertEqual(after.data.get("user_id"), str(self.emt.id))

    def test_hospital_reassignment_copies_identity_fields(self):
        url = reverse("admin-create-hospital-admin")
        response = self.client.post(url, {
            "email": "new-hosp@example.com",
            "password": "TestPass123!",
            "confirm_password": "TestPass123!",
            "admin_contact_name": "New Hospital Admin",
            "successor_of": str(self.old_hospital.id),
            **_hospital_docs(),
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        new_hospital = User.objects.get(email="new-hosp@example.com")
        self.assertEqual(new_hospital.facility_name, "Legacy Hospital")
        self.assertEqual(new_hospital.facility_type, "public")
        self.assertEqual(new_hospital.official_address, "1 Old Street")
        self.assertTrue(new_hospital.is_active)

    def test_successor_identity_fields_override_request_body(self):
        # The old account's values win over anything sent in the request for
        # the same fields — continuity of institution identity is the point.
        url = reverse("admin-create-ambulance-admin")
        response = self.client.post(url, {
            "email": "new-amb2@example.com",
            "password": "TestPass123!",
            "confirm_password": "TestPass123!",
            "service_name": "Should Be Ignored",
            "successor_of": str(self.old_ambulance.id),
            **_ambulance_docs(),
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        new_ambulance = User.objects.get(email="new-amb2@example.com")
        self.assertEqual(new_ambulance.service_name, "Legacy EMS")

    def test_historical_incidents_stay_attributed_to_old_account(self):
        incident = Incident.objects.create(
            patient=self.patient,
            ambulance_service=self.old_ambulance,
            status=IncidentStatus.COMPLETED,
        )

        url = reverse("admin-create-ambulance-admin")
        response = self.client.post(url, {
            "email": "new-amb3@example.com",
            "password": "TestPass123!",
            "confirm_password": "TestPass123!",
            "successor_of": str(self.old_ambulance.id),
            **_ambulance_docs(),
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        incident.refresh_from_db()
        self.assertEqual(incident.ambulance_service_id, self.old_ambulance.id)

    def test_cannot_reassign_to_active_account(self):
        active_ambulance = User.objects.create_user(
            email="active-amb@example.com", password="pass", role=Role.AMBULANCE_ADMIN,
            service_name="Still Running EMS",
        )
        url = reverse("admin-create-ambulance-admin")
        response = self.client.post(url, {
            "email": "new-amb4@example.com",
            "password": "TestPass123!",
            "confirm_password": "TestPass123!",
            "successor_of": str(active_ambulance.id),
            **_ambulance_docs(),
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("successor_of", response.data)
        self.assertFalse(User.objects.filter(email="new-amb4@example.com").exists())

    def test_cannot_reassign_ambulance_creation_to_hospital_account(self):
        url = reverse("admin-create-ambulance-admin")
        response = self.client.post(url, {
            "email": "new-amb5@example.com",
            "password": "TestPass123!",
            "confirm_password": "TestPass123!",
            "successor_of": str(self.old_hospital.id),
            **_ambulance_docs(),
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("successor_of", response.data)

    def test_cannot_reassign_hospital_creation_to_ambulance_account(self):
        url = reverse("admin-create-hospital-admin")
        response = self.client.post(url, {
            "email": "new-hosp2@example.com",
            "password": "TestPass123!",
            "confirm_password": "TestPass123!",
            "successor_of": str(self.old_ambulance.id),
            **_hospital_docs(),
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("successor_of", response.data)

    def test_successor_of_nonexistent_account_rejected(self):
        url = reverse("admin-create-ambulance-admin")
        response = self.client.post(url, {
            "email": "new-amb6@example.com",
            "password": "TestPass123!",
            "confirm_password": "TestPass123!",
            "successor_of": str(uuid.uuid4()),
            **_ambulance_docs(),
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("successor_of", response.data)

    def test_creation_without_successor_of_still_works_normally(self):
        url = reverse("admin-create-ambulance-admin")
        response = self.client.post(url, {
            "email": "brand-new-amb@example.com",
            "password": "TestPass123!",
            "confirm_password": "TestPass123!",
            "service_name": "Brand New EMS",
            **_ambulance_docs(),
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        new_ambulance = User.objects.get(email="brand-new-amb@example.com")
        self.assertEqual(new_ambulance.service_name, "Brand New EMS")


class AdminUserEditTest(TestCase):
    # PATCH /auth/admin/users/{id}/ — MERA admin editing any account's basic info.

    def setUp(self):
        self.mera_admin = User.objects.create_user(
            email="mera-edit@example.com", password="pass", role=Role.MERA_ADMIN,
        )
        self.patient = User.objects.create_user(
            email="edit-patient@example.com", password="pass", role=Role.PATIENT,
            full_name="Old Name", phone_number="0810000000",
        )
        self.hospital = User.objects.create_user(
            email="edit-hosp@example.com", password="pass", role=Role.HOSPITAL_ADMIN,
            facility_name="Old Facility Name",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.mera_admin)

    def test_can_edit_patient_basic_info(self):
        url = reverse("admin-user-edit", args=[self.patient.id])
        response = self.client.patch(url, {
            "full_name": "New Name",
            "phone_number": "0829999999",
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.patient.refresh_from_db()
        self.assertEqual(self.patient.full_name, "New Name")
        self.assertEqual(self.patient.phone_number, "0829999999")

    def test_can_edit_hospital_facility_name(self):
        url = reverse("admin-user-edit", args=[self.hospital.id])
        response = self.client.patch(url, {"facility_name": "New Facility Name"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.hospital.refresh_from_db()
        self.assertEqual(self.hospital.facility_name, "New Facility Name")

    def test_role_and_password_are_not_editable(self):
        old_hash = self.patient.password
        url = reverse("admin-user-edit", args=[self.patient.id])
        response = self.client.patch(url, {"role": "mera_admin", "password": "newpass123"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.patient.refresh_from_db()
        self.assertEqual(self.patient.role, Role.PATIENT)
        self.assertEqual(self.patient.password, old_hash)

    def test_duplicate_email_rejected(self):
        url = reverse("admin-user-edit", args=[self.patient.id])
        response = self.client.patch(url, {"email": "edit-hosp@example.com"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_mera_admin_forbidden(self):
        self.client.force_authenticate(user=self.hospital)
        url = reverse("admin-user-edit", args=[self.patient.id])
        response = self.client.patch(url, {"full_name": "Hacked"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class LoginRejectsDeactivatedAccountTest(TestCase):
    # LoginView previously never checked is_active at all — any deactivated
    # account (any role) could still log in and receive a real token. Fixed
    # alongside the reactivate endpoint, since "reactivate" only means
    # anything if "deactivate" actually blocks access in the first place.

    def setUp(self):
        self.client = APIClient()
        self.url = reverse("login")

    def test_deactivated_patient_cannot_log_in(self):
        User.objects.create_user(
            email="inactive-patient@example.com", password="pass",
            role=Role.PATIENT, full_name="Inactive Patient", is_active=False,
        )
        response = self.client.post(self.url, {
            "email": "inactive-patient@example.com", "password": "pass",
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @patch("accounts.views.requests.post")
    def test_active_patient_can_still_log_in(self, mock_post):
        # Guard against an overly-broad fix accidentally blocking everyone.
        # Reaches the patient OTP branch, so Brevo's send is mocked — this
        # test is about is_active, not email delivery.
        mock_post.return_value = Mock(status_code=201, raise_for_status=Mock())
        User.objects.create_user(
            email="active-patient@example.com", password="pass",
            role=Role.PATIENT, full_name="Active Patient",
        )
        response = self.client.post(self.url, {
            "email": "active-patient@example.com", "password": "pass",
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class ReactivateUserTest(TestCase):
    # PATCH /auth/admin/users/{id}/reactivate/ — the inverse of
    # DeactivateUserView, including its cascading behavior for ambulance
    # accounts (see ReactivateUserView's comments for the reasoning).

    def setUp(self):
        self.mera_admin = User.objects.create_user(
            email="mera-reactivate@example.com", password="pass", role=Role.MERA_ADMIN,
        )
        self.ambulance = User.objects.create_user(
            email="reactivate-amb@example.com", password="pass", role=Role.AMBULANCE_ADMIN,
            service_name="Reactivate EMS", is_active=False,
        )
        self.emt1 = User.objects.create_user(
            email="reactivate-emt1@example.com", password="pass", role=Role.EMT,
            full_name="EMT One", ambulance_service=self.ambulance, is_active=False,
        )
        self.emt2 = User.objects.create_user(
            email="reactivate-emt2@example.com", password="pass", role=Role.EMT,
            full_name="EMT Two", ambulance_service=self.ambulance, is_active=False,
        )
        self.already_active_emt = User.objects.create_user(
            email="reactivate-emt3@example.com", password="pass", role=Role.EMT,
            full_name="EMT Three", ambulance_service=self.ambulance, is_active=True,
        )
        self.hospital = User.objects.create_user(
            email="reactivate-hosp@example.com", password="pass", role=Role.HOSPITAL_ADMIN,
            facility_name="Reactivate Hospital", is_active=False,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.mera_admin)

    def test_reactivate_sets_is_active_true(self):
        url = reverse("admin-user-reactivate", args=[self.hospital.id])
        response = self.client.patch(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.hospital.refresh_from_db()
        self.assertTrue(self.hospital.is_active)

    def test_reactivating_ambulance_admin_cascades_to_its_inactive_emts(self):
        url = reverse("admin-user-reactivate", args=[self.ambulance.id])
        response = self.client.patch(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.ambulance.refresh_from_db()
        self.emt1.refresh_from_db()
        self.emt2.refresh_from_db()
        self.assertTrue(self.ambulance.is_active)
        self.assertTrue(self.emt1.is_active)
        self.assertTrue(self.emt2.is_active)

    def test_response_reports_reactivated_emt_count_excluding_already_active(self):
        url = reverse("admin-user-reactivate", args=[self.ambulance.id])
        response = self.client.patch(url)
        self.assertEqual(response.data["reactivated_emt_count"], 2)

    def test_reactivating_hospital_admin_has_no_cascade(self):
        url = reverse("admin-user-reactivate", args=[self.hospital.id])
        response = self.client.patch(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["reactivated_emt_count"], 0)

    def test_other_ambulances_emts_unaffected(self):
        other_ambulance = User.objects.create_user(
            email="reactivate-other-amb@example.com", password="pass", role=Role.AMBULANCE_ADMIN,
            service_name="Other EMS", is_active=False,
        )
        other_emt = User.objects.create_user(
            email="reactivate-other-emt@example.com", password="pass", role=Role.EMT,
            full_name="Other EMT", ambulance_service=other_ambulance, is_active=False,
        )
        url = reverse("admin-user-reactivate", args=[self.ambulance.id])
        self.client.patch(url)
        other_emt.refresh_from_db()
        self.assertFalse(other_emt.is_active)

    def test_reactivating_already_active_user_is_idempotent_success(self):
        url = reverse("admin-user-reactivate", args=[self.already_active_emt.id])
        response = self.client.patch(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.already_active_emt.refresh_from_db()
        self.assertTrue(self.already_active_emt.is_active)

    def test_reactivate_nonexistent_user_404(self):
        url = reverse("admin-user-reactivate", args=[uuid.uuid4()])
        response = self.client.patch(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class RequiredInstitutionDocumentsTest(TestCase):
    # Required onboarding documents on HospitalAdminCreationSerializer/
    # AmbulanceAdminCreationSerializer — per the original project spec:
    # hospitals need a Health Facility Certificate + CIPC Registration
    # Document; ambulance services need an EMS Operating License + HPCSA/DoH
    # Registration Document. The real Cloudinary API is never hit —
    # accounts.serializers.cloudinary_upload is mocked directly, same
    # approach this codebase already uses for every other external service
    # call (Brevo, Google, Google Routes — see EmailOTPLoginTest/
    # GoogleSignInTest/emergencies.tests.RouteEndpointTest).

    def setUp(self):
        self.mera_admin = User.objects.create_user(
            email="mera-docs@example.com", password="pass", role=Role.MERA_ADMIN,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.mera_admin)
        self.hospital_url = reverse("admin-create-hospital-admin")
        self.ambulance_url = reverse("admin-create-ambulance-admin")

        patcher = patch("accounts.serializers.cloudinary_upload")
        self.mock_upload = patcher.start()
        self.addCleanup(patcher.stop)
        self.mock_upload.return_value = {"secure_url": "https://res.cloudinary.com/mera-test/doc123.pdf"}

    def _hospital_payload(self, **overrides):
        payload = {
            "email": "new-hospital-docs@example.com",
            "password": "TestPass123!",
            "confirm_password": "TestPass123!",
            "facility_name": "Docs Test Hospital",
        }
        payload.update(overrides)
        return payload

    def _ambulance_payload(self, **overrides):
        payload = {
            "email": "new-ambulance-docs@example.com",
            "password": "TestPass123!",
            "confirm_password": "TestPass123!",
            "service_name": "Docs Test EMS",
        }
        payload.update(overrides)
        return payload

    # --- Hospital ---------------------------------------------------------

    def test_hospital_creation_succeeds_with_both_required_documents(self):
        response = self.client.post(self.hospital_url, {
            **self._hospital_payload(),
            **_hospital_docs(),
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        user = User.objects.get(email="new-hospital-docs@example.com")
        self.assertEqual(user.health_facility_certificate_url, "https://res.cloudinary.com/mera-test/doc123.pdf")
        self.assertEqual(user.cipc_registration_url, "https://res.cloudinary.com/mera-test/doc123.pdf")
        # One Cloudinary upload call per document, not one for the whole request.
        self.assertEqual(self.mock_upload.call_count, 2)

    def test_hospital_creation_rejected_without_any_documents(self):
        response = self.client.post(self.hospital_url, self._hospital_payload())
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("health_facility_certificate", response.data)
        self.assertIn("cipc_registration_document", response.data)
        self.assertFalse(User.objects.filter(email="new-hospital-docs@example.com").exists())
        self.mock_upload.assert_not_called()

    def test_hospital_creation_rejected_missing_only_cipc_document(self):
        # Both documents are independently required — supplying only one
        # must still fail, and must name specifically the missing one.
        docs = _hospital_docs()
        docs.pop("cipc_registration_document")
        response = self.client.post(self.hospital_url, {**self._hospital_payload(), **docs})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cipc_registration_document", response.data)
        self.assertNotIn("health_facility_certificate", response.data)

    # --- Ambulance ----------------------------------------------------------

    def test_ambulance_creation_succeeds_with_both_required_documents(self):
        response = self.client.post(self.ambulance_url, {
            **self._ambulance_payload(),
            **_ambulance_docs(),
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        user = User.objects.get(email="new-ambulance-docs@example.com")
        self.assertEqual(user.ems_operating_license_url, "https://res.cloudinary.com/mera-test/doc123.pdf")
        self.assertEqual(user.hpcsa_doh_registration_url, "https://res.cloudinary.com/mera-test/doc123.pdf")
        self.assertEqual(self.mock_upload.call_count, 2)

    def test_ambulance_creation_rejected_without_any_documents(self):
        response = self.client.post(self.ambulance_url, self._ambulance_payload())
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("ems_operating_license", response.data)
        self.assertIn("hpcsa_doh_registration_document", response.data)
        self.assertFalse(User.objects.filter(email="new-ambulance-docs@example.com").exists())
        self.mock_upload.assert_not_called()

    def test_ambulance_creation_rejected_missing_only_hpcsa_document(self):
        docs = _ambulance_docs()
        docs.pop("hpcsa_doh_registration_document")
        response = self.client.post(self.ambulance_url, {**self._ambulance_payload(), **docs})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("hpcsa_doh_registration_document", response.data)
        self.assertNotIn("ems_operating_license", response.data)

    # --- Retrieval by MERA admin -------------------------------------------

    def test_document_urls_retrievable_via_institutions_list(self):
        # Item 5: MERA admin can view/download these via the institutions
        # endpoint, distinct URLs per document (not the same upload
        # response reused blindly for both).
        self.mock_upload.side_effect = [
            {"secure_url": "https://res.cloudinary.com/mera-test/certificate.pdf"},
            {"secure_url": "https://res.cloudinary.com/mera-test/cipc.pdf"},
        ]
        create_response = self.client.post(self.hospital_url, {
            **self._hospital_payload(),
            **_hospital_docs(),
        })
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        new_user_id = create_response.data["user"]["id"]

        list_response = self.client.get(reverse("admin-institutions"))
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        row = next(r for r in list_response.data if r["id"] == new_user_id)
        self.assertEqual(row["health_facility_certificate_url"], "https://res.cloudinary.com/mera-test/certificate.pdf")
        self.assertEqual(row["cipc_registration_url"], "https://res.cloudinary.com/mera-test/cipc.pdf")
        # The ambulance-only pair stays blank for a hospital row.
        self.assertEqual(row["ems_operating_license_url"], "")
        self.assertEqual(row["hpcsa_doh_registration_url"], "")

    def test_documents_required_even_with_successor_of(self):
        # Identity fields are inherited from the old account on reassignment,
        # but the required-documents gate applies uniformly regardless —
        # see the comment on HospitalAdminCreationSerializer's document
        # fields for why fresh documents are still required here.
        old_hospital = User.objects.create_user(
            email="old-docs-hosp@example.com", password="pass", role=Role.HOSPITAL_ADMIN,
            facility_name="Old Docs Hospital", is_active=False,
        )
        response = self.client.post(self.hospital_url, self._hospital_payload(
            successor_of=str(old_hospital.id),
        ))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("health_facility_certificate", response.data)


@override_settings(BREVO_API_KEY="test-brevo-key", BREVO_SENDER_EMAIL="noreply@test.mera.example")
class TriggerPasswordResetTest(TestCase):
    # POST /auth/admin/users/{id}/trigger-password-reset/ — MERA-admin
    # side of this endpoint (unrestricted, any account). See
    # TriggerPasswordResetPermissionsTest below for the ambulance_admin-
    # scoped-to-own-EMTs caller and the hospital_admin rejection. Reuses
    # the exact same PasswordResetToken mechanism the self-service flow
    # uses (accounts/serializers.py::issue_password_reset_token) and the
    # completely unmodified PasswordResetConfirmView/Serializer — there is
    # no separate confirm endpoint for this flow. Brevo is mocked the same
    # way EmailOTPLoginTest mocks it (accounts.views.requests.post), never
    # hit for real.

    def setUp(self):
        self.mera_admin = User.objects.create_user(
            email="mera-pwreset@example.com", password="pass", role=Role.MERA_ADMIN,
        )
        self.hospital = User.objects.create_user(
            email="reset-target@example.com", password="OldPass123!", role=Role.HOSPITAL_ADMIN,
            facility_name="Reset Target Hospital",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.mera_admin)

        patcher = patch("accounts.views.requests.post")
        self.mock_post = patcher.start()
        self.addCleanup(patcher.stop)
        self.mock_post.return_value = Mock(status_code=201, raise_for_status=Mock())

    def _trigger(self, user_id):
        return self.client.post(reverse("admin-trigger-password-reset", args=[user_id]))

    def _extract_token_from_email(self):
        call = self.mock_post.call_args
        text = call.kwargs["json"]["textContent"]
        # "<WEB_FRONTEND_URL>/reset-password?token=<token>" — the token is
        # everything after "token=" (token_urlsafe output has no query-
        # string-unsafe characters, so this simple split is exact, not
        # approximate).
        return text.split("token=")[1].split()[0]

    def test_trigger_sends_email_and_creates_unused_token(self):
        response = self._trigger(self.hospital.id)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.assertEqual(self.mock_post.call_count, 1)
        call = self.mock_post.call_args
        self.assertEqual(call.args[0], "https://api.brevo.com/v3/smtp/email")
        self.assertEqual(call.kwargs["headers"]["api-key"], "test-brevo-key")
        self.assertEqual(call.kwargs["json"]["to"], [{"email": "reset-target@example.com"}])
        self.assertEqual(call.kwargs["json"]["sender"], {"email": "noreply@test.mera.example"})
        self.assertEqual(call.kwargs["timeout"], 10.0)

        token = PasswordResetToken.objects.get(user=self.hospital, used=False)
        self.assertTrue(token.is_valid)

    def test_generated_token_works_with_existing_confirm_endpoint(self):
        self._trigger(self.hospital.id)
        token_value = self._extract_token_from_email()

        confirm_response = self.client.post(reverse("password-reset-confirm"), {
            "token": token_value,
            "new_password": "BrandNewPass456!",
            "confirm_password": "BrandNewPass456!",
        })
        self.assertEqual(confirm_response.status_code, status.HTTP_200_OK)

        self.hospital.refresh_from_db()
        self.assertTrue(self.hospital.check_password("BrandNewPass456!"))
        self.assertFalse(self.hospital.check_password("OldPass123!"))

        used_token = PasswordResetToken.objects.get(token=token_value)
        self.assertTrue(used_token.used)

    def test_trigger_for_nonexistent_user_returns_404(self):
        response = self._trigger(uuid.uuid4())
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.mock_post.assert_not_called()

    def test_non_mera_admin_forbidden(self):
        self.client.force_authenticate(user=self.hospital)
        response = self._trigger(self.hospital.id)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.mock_post.assert_not_called()

    def test_new_trigger_invalidates_previous_unused_token(self):
        self._trigger(self.hospital.id)
        first_token_value = self._extract_token_from_email()

        self._trigger(self.hospital.id)
        second_token_value = self._extract_token_from_email()

        self.assertNotEqual(first_token_value, second_token_value)
        first_token = PasswordResetToken.objects.get(token=first_token_value)
        self.assertTrue(first_token.used)

        # The old (now-invalidated) token must no longer work...
        stale_confirm = self.client.post(reverse("password-reset-confirm"), {
            "token": first_token_value,
            "new_password": "ShouldNotWork123!",
            "confirm_password": "ShouldNotWork123!",
        })
        self.assertEqual(stale_confirm.status_code, status.HTTP_400_BAD_REQUEST)

        # ...while the newest one still does.
        fresh_confirm = self.client.post(reverse("password-reset-confirm"), {
            "token": second_token_value,
            "new_password": "ShouldWork123!",
            "confirm_password": "ShouldWork123!",
        })
        self.assertEqual(fresh_confirm.status_code, status.HTTP_200_OK)

    def test_delivery_failure_returns_503_and_creates_no_token(self):
        self.mock_post.side_effect = requests.exceptions.Timeout("Brevo took too long")
        response = self._trigger(self.hospital.id)
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        # Send-before-persist: a failed delivery must not leave a token
        # behind for a link that was never actually emailed.
        self.assertFalse(PasswordResetToken.objects.filter(user=self.hospital).exists())

    def test_delivery_failure_leaves_existing_token_usable(self):
        # A prior successful trigger already gave the user a live token;
        # a second, failed attempt must not invalidate it.
        self._trigger(self.hospital.id)
        original_token_value = self._extract_token_from_email()

        self.mock_post.side_effect = requests.exceptions.Timeout("Brevo took too long")
        response = self._trigger(self.hospital.id)
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

        original_token = PasswordResetToken.objects.get(token=original_token_value)
        self.assertFalse(original_token.used)


@override_settings(BREVO_API_KEY="test-brevo-key", BREVO_SENDER_EMAIL="noreply@test.mera.example")
class TriggerPasswordResetPermissionsTest(TestCase):
    # POST /auth/admin/users/{id}/trigger-password-reset/ — the widened
    # permission model: ambulance_admin (or legacy ambulance_service) may
    # now trigger a reset for one of their own EMTs, scoped exactly the way
    # EMTUpdateDeleteTest already proves EMTUpdateView is (role=EMT AND
    # ambulance_service=caller, a mismatch or non-EMT target 404s rather
    # than 403ing so ownership isn't leaked). MERA admin keeps unrestricted
    # access — reconfirmed here against a non-hospital target too, since
    # TriggerPasswordResetTest above only ever exercises it against a
    # hospital_admin. hospital_admin gets no access at all (no subordinate
    # accounts of their own to use this on).

    def setUp(self):
        self.mera_admin = User.objects.create_user(
            email="mera-pwreset-perm@example.com", password="pass", role=Role.MERA_ADMIN,
        )
        self.ambulance = User.objects.create_user(
            email="amb-pwreset@example.com", password="pass", role=Role.AMBULANCE_ADMIN,
            service_name="Test EMS",
        )
        self.other_ambulance = User.objects.create_user(
            email="other-amb-pwreset@example.com", password="pass", role=Role.AMBULANCE_SERVICE,
            service_name="Other EMS",
        )
        self.own_emt = User.objects.create_user(
            email="own-emt-pwreset@example.com", password="pass", role=Role.EMT,
            full_name="Own EMT", ambulance_service=self.ambulance,
        )
        self.other_emt = User.objects.create_user(
            email="other-emt-pwreset@example.com", password="pass", role=Role.EMT,
            full_name="Other EMT", ambulance_service=self.other_ambulance,
        )
        self.hospital_admin = User.objects.create_user(
            email="hosp-pwreset-perm@example.com", password="pass", role=Role.HOSPITAL_ADMIN,
            facility_name="Perm Test Hospital",
        )
        self.client = APIClient()

        patcher = patch("accounts.views.requests.post")
        self.mock_post = patcher.start()
        self.addCleanup(patcher.stop)
        self.mock_post.return_value = Mock(status_code=201, raise_for_status=Mock())

    def _trigger(self, user_id):
        return self.client.post(reverse("admin-trigger-password-reset", args=[user_id]))

    def test_ambulance_admin_can_reset_own_emt(self):
        self.client.force_authenticate(user=self.ambulance)
        response = self._trigger(self.own_emt.id)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.mock_post.call_count, 1)
        self.assertTrue(PasswordResetToken.objects.filter(user=self.own_emt, used=False).exists())

    def test_ambulance_admin_cannot_reset_unrelated_emt(self):
        self.client.force_authenticate(user=self.ambulance)
        response = self._trigger(self.other_emt.id)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.mock_post.assert_not_called()
        self.assertFalse(PasswordResetToken.objects.filter(user=self.other_emt).exists())

    def test_ambulance_admin_cannot_reset_a_non_emt_account(self):
        # Confirms the role=EMT filter, not just the ambulance_service FK,
        # is actually enforced — an ambulance_admin shouldn't be able to
        # target another institution's own admin account just because it's
        # otherwise a valid user id.
        self.client.force_authenticate(user=self.ambulance)
        response = self._trigger(self.other_ambulance.id)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.mock_post.assert_not_called()

    def test_hospital_admin_forbidden(self):
        self.client.force_authenticate(user=self.hospital_admin)
        response = self._trigger(self.own_emt.id)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.mock_post.assert_not_called()

    def test_mera_admin_can_reset_any_role_including_an_emt(self):
        self.client.force_authenticate(user=self.mera_admin)
        response = self._trigger(self.other_emt.id)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(PasswordResetToken.objects.filter(user=self.other_emt, used=False).exists())


@override_settings(BREVO_API_KEY="test-brevo-key", BREVO_SENDER_EMAIL="noreply@test.mera.example")
class PasswordResetRequestTest(TestCase):
    # POST /auth/password-reset/ — self-service, unauthenticated, any role.
    # Newly wired up to actually send email (accounts/views.py::
    # PasswordResetRequestView) — previously this endpoint existed and
    # created a token but never emailed it (a dead TODO). Reuses
    # issue_password_reset_token/_send_password_reset_email, the same
    # functions TriggerPasswordResetTest's flow uses, and the token this
    # produces is consumed by the same unmodified PasswordResetConfirmView.
    #
    # Anti-enumeration is the actual point of this test class: an existing
    # email, a nonexistent one, and an existing email whose send fails must
    # all be indistinguishable from the response alone.

    def setUp(self):
        self.user = User.objects.create_user(
            email="selfservice-target@example.com", password="OldPass123!", role=Role.HOSPITAL_ADMIN,
            facility_name="Self Service Hospital",
        )
        self.client = APIClient()
        self.url = reverse("password-reset-request")

        patcher = patch("accounts.views.requests.post")
        self.mock_post = patcher.start()
        self.addCleanup(patcher.stop)
        self.mock_post.return_value = Mock(status_code=201, raise_for_status=Mock())

    def _extract_token_from_email(self):
        text = self.mock_post.call_args.kwargs["json"]["textContent"]
        return text.split("token=")[1].split()[0]

    def test_existing_email_sends_reset_email_and_creates_token(self):
        response = self.client.post(self.url, {"email": "selfservice-target@example.com"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["detail"],
            "A password reset link has been sent.",
        )
        self.assertEqual(self.mock_post.call_count, 1)
        call = self.mock_post.call_args
        self.assertEqual(call.kwargs["json"]["to"], [{"email": "selfservice-target@example.com"}])
        self.assertTrue(PasswordResetToken.objects.filter(user=self.user, used=False).exists())

    def test_nonexistent_email_returns_identical_response_with_no_side_effects(self):
        existing = self.client.post(self.url, {"email": "selfservice-target@example.com"})
        self.mock_post.reset_mock()

        nonexistent = self.client.post(self.url, {"email": "no-such-account@example.com"})

        # The whole point: same status, same body, regardless of whether
        # the account exists.
        self.assertEqual(nonexistent.status_code, existing.status_code)
        self.assertEqual(nonexistent.data, existing.data)
        self.mock_post.assert_not_called()
        self.assertEqual(PasswordResetToken.objects.filter(user=self.user).count(), 1)

    def test_delivery_failure_still_returns_the_same_generic_response(self):
        # The critical anti-enumeration case: if this returned a distinct
        # status/message when delivery fails, that distinction itself would
        # leak "this email exists" — a 503-only-for-real-accounts response
        # is just as much of a leak as a 404 would be.
        self.mock_post.side_effect = requests.exceptions.Timeout("Brevo took too long")
        response = self.client.post(self.url, {"email": "selfservice-target@example.com"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["detail"],
            "A password reset link has been sent.",
        )
        # And no token left dangling for an email that was never delivered.
        self.assertFalse(PasswordResetToken.objects.filter(user=self.user).exists())

    def test_generated_token_works_with_confirm_endpoint(self):
        self.client.post(self.url, {"email": "selfservice-target@example.com"})
        token_value = self._extract_token_from_email()

        confirm = self.client.post(reverse("password-reset-confirm"), {
            "token": token_value,
            "new_password": "BrandNewSelfServe456!",
            "confirm_password": "BrandNewSelfServe456!",
        })
        self.assertEqual(confirm.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("BrandNewSelfServe456!"))

    def test_missing_email_field_rejected(self):
        response = self.client.post(self.url, {})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.mock_post.assert_not_called()

    def test_repeated_requests_to_same_email_stop_sending_but_response_stays_identical(self):
        # Closes the gap PROJECT_CONTEXT.md flagged: the general per-IP anon
        # throttle doesn't bound "how many emails can one target inbox
        # receive" — a caller spread across IPs could otherwise spam one
        # address indefinitely. _password_reset_generation_allowed() caps
        # real sends at PASSWORD_RESET_MAX_PER_WINDOW (3) per hour per
        # account — this test proves both halves of that fix at once:
        # real Brevo calls actually stop after the 3rd, AND the HTTP
        # response is byte-for-byte identical on every single request,
        # including the ones silently capped. A different response once
        # the limit hits would itself be a new enumeration vector — it
        # would reveal that this address had actually been receiving
        # emails right up until it suddenly stopped.
        first_response = self.client.post(self.url, {"email": "selfservice-target@example.com"})

        for _ in range(2):  # 2 more = 3 total, the configured limit
            response = self.client.post(self.url, {"email": "selfservice-target@example.com"})
            self.assertEqual(response.status_code, first_response.status_code)
            self.assertEqual(response.data, first_response.data)

        self.assertEqual(self.mock_post.call_count, 3)

        # One more, past the limit — no new Brevo call is made...
        capped_response = self.client.post(self.url, {"email": "selfservice-target@example.com"})
        self.assertEqual(self.mock_post.call_count, 3)
        # ...but the response is still identical to every one before it.
        self.assertEqual(capped_response.status_code, first_response.status_code)
        self.assertEqual(capped_response.data, first_response.data)

        # A couple more for good measure — stays capped, stays identical.
        for _ in range(2):
            again = self.client.post(self.url, {"email": "selfservice-target@example.com"})
            self.assertEqual(self.mock_post.call_count, 3)
            self.assertEqual(again.status_code, first_response.status_code)
            self.assertEqual(again.data, first_response.data)

        # And the account's own real requester isn't left with more than
        # the intended number of live tokens either.
        self.assertEqual(PasswordResetToken.objects.filter(user=self.user, used=False).count(), 1)
        self.assertEqual(PasswordResetToken.objects.filter(user=self.user).count(), 3)


@override_settings(CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}})
class ThrottlingTest(TestCase):
    # DRF's throttling framework (settings.py's DEFAULT_THROTTLE_CLASSES/
    # DEFAULT_THROTTLE_RATES) — previously entirely unconfigured. Covers
    # both the general anon/user defaults and the two named scopes.
    #
    # The class-level CACHES override above opts this class back into a
    # real cache — settings.py switches CACHES to DummyCache for the rest
    # of the test run specifically so throttling doesn't interfere with
    # every other, unrelated test (see that setting's own comment for why:
    # Django's test client shares one fake IP across the whole suite, so a
    # real cache would let anonymous calls from many unrelated test classes
    # pile into one shared bucket). This class is the one place that real
    # behavior is actually being tested, so it needs a real cache back.
    #
    # Testing approach, chosen specifically to avoid slow/flaky tests:
    #  - The two SCOPED throttles (password_reset_trigger=5/hour,
    #    institutional_documents=20/hour) are tested at their REAL
    #    configured rate — the numbers are small enough that making that
    #    many requests in a loop is fast and needs no rate manipulation.
    #  - The GENERAL anon/user throttles are 30/min and 100/min — too many
    #    requests to loop through quickly, so these tests instead mutate
    #    AnonRateThrottle.THROTTLE_RATES/UserRateThrottle.THROTTLE_RATES
    #    directly (the actual dict DRF's throttle classes read from at
    #    request time — the same dict object for every SimpleRateThrottle
    #    subclass, keyed by scope) down to a tiny rate just for that one
    #    test, restored via addCleanup. This is deliberately NOT done via
    #    @override_settings(REST_FRAMEWORK=...): DRF's throttle classes
    #    cache DEFAULT_THROTTLE_RATES into their own THROTTLE_RATES class
    #    attribute once, at import time, so re-overriding the Django
    #    setting later doesn't actually change what an already-imported
    #    throttle class reads — a real, documented DRF testing gotcha.
    #    Mutating the dict in place sidesteps it entirely.
    #  - cache.clear() in setUp/tearDown: throttle counters live in CACHES
    #    (LocMemCache), which — unlike the DB — Django's test runner does
    #    NOT reset between tests. Every other test in this file creates a
    #    fresh user with a fresh random UUID per test, so authenticated
    #    (user-keyed) throttle buckets never actually collide across tests
    #    in practice — but ANONYMOUS throttle keys are IP-based, and every
    #    request from Django's test client shares the same fake IP, so
    #    without clearing the cache the anon test below could pass or fail
    #    depending on what ran before it in the same process. Cleared both
    #    directions (setUp and tearDown) to protect this class from state
    #    left by other tests, and other tests from state left by this one.

    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    def test_anonymous_general_throttle_triggers(self):
        original_rate = AnonRateThrottle.THROTTLE_RATES.get("anon")
        AnonRateThrottle.THROTTLE_RATES["anon"] = "3/min"
        self.addCleanup(AnonRateThrottle.THROTTLE_RATES.__setitem__, "anon", original_rate)

        client = APIClient()
        url = reverse("password-reset-request")
        for _ in range(3):
            response = client.post(url, {"email": "throttle-anon@example.com"})
            self.assertNotEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        fourth = client.post(url, {"email": "throttle-anon@example.com"})
        self.assertEqual(fourth.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_authenticated_general_throttle_triggers(self):
        original_rate = UserRateThrottle.THROTTLE_RATES.get("user")
        UserRateThrottle.THROTTLE_RATES["user"] = "3/min"
        self.addCleanup(UserRateThrottle.THROTTLE_RATES.__setitem__, "user", original_rate)

        user = User.objects.create_user(
            email="throttle-user@example.com", password="pass", role=Role.PATIENT, full_name="Throttle Patient",
        )
        client = APIClient()
        client.force_authenticate(user=user)
        url = reverse("me")

        for _ in range(3):
            response = client.get(url)
            self.assertNotEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        fourth = client.get(url)
        self.assertEqual(fourth.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    @override_settings(BREVO_API_KEY="test-brevo-key", BREVO_SENDER_EMAIL="noreply@test.mera.example")
    def test_password_reset_trigger_scope_throttles_at_configured_rate(self):
        with patch("accounts.views.requests.post") as mock_post:
            mock_post.return_value = Mock(status_code=201, raise_for_status=Mock())

            mera_admin = User.objects.create_user(
                email="throttle-pwreset-mera@example.com", password="pass", role=Role.MERA_ADMIN,
            )
            target = User.objects.create_user(
                email="throttle-pwreset-target@example.com", password="pass", role=Role.HOSPITAL_ADMIN,
                facility_name="Throttle Target Hospital",
            )
            client = APIClient()
            client.force_authenticate(user=mera_admin)
            url = reverse("admin-trigger-password-reset", args=[target.id])

            # Configured rate is 5/hour — real number, no mutation needed.
            for _ in range(5):
                response = client.post(url)
                self.assertNotEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

            sixth = client.post(url)
            self.assertEqual(sixth.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_institutional_documents_scope_throttles_at_configured_rate(self):
        mera_admin = User.objects.create_user(
            email="throttle-docs-mera@example.com", password="pass", role=Role.MERA_ADMIN,
        )
        client = APIClient()
        client.force_authenticate(user=mera_admin)
        url = reverse("admin-create-hospital-admin")

        # Deliberately incomplete payload — the throttle check happens
        # before serializer validation, so an otherwise-invalid request
        # still counts and no real Cloudinary call is ever at risk here.
        # Configured rate is 20/hour — real number, no mutation needed.
        for _ in range(20):
            response = client.post(url, {})
            self.assertNotEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        twenty_first = client.post(url, {})
        self.assertEqual(twenty_first.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_institutional_documents_scope_shared_across_the_three_endpoints(self):
        # DRF's ScopedRateThrottle keys on (scope, caller) only — not the
        # specific view/URL — so the same admin splitting calls across
        # HospitalAdminCreateView/AmbulanceAdminCreateView/
        # InstitutionalDocumentUploadView hits one combined ceiling, per
        # the shared-scope reasoning in settings.py's DEFAULT_THROTTLE_RATES
        # comment. 10 + 10 + 1 = the 21st combined request, over the 20/hour
        # limit, on a *third*, different endpoint from the first two.
        mera_admin = User.objects.create_user(
            email="throttle-shared-mera@example.com", password="pass", role=Role.MERA_ADMIN,
        )
        client = APIClient()
        client.force_authenticate(user=mera_admin)
        hospital_url = reverse("admin-create-hospital-admin")
        ambulance_url = reverse("admin-create-ambulance-admin")
        upload_url = reverse("institutional-documents")

        for _ in range(10):
            response = client.post(hospital_url, {})
            self.assertNotEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        for _ in range(10):
            response = client.post(ambulance_url, {})
            self.assertNotEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        twenty_first = client.post(upload_url, {})
        self.assertEqual(twenty_first.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
