# Tests for user registration, login, password reset, and role-based access.


import uuid
from datetime import timedelta
from unittest.mock import patch

from django.core import mail
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from emergencies.models import Incident, IncidentStatus
from .models import EmailOTP, InstitutionalStatus, Role, User


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

    def test_successful_login_requires_otp_for_patient(self):
        # Patients now get an OTP-required response instead of tokens
        # directly — see GoogleSignInTest... no, see the OTP test classes
        # below for the full two-step round trip (login -> verify-otp).
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


class EmailOTPLoginTest(TestCase):
    # Second factor on top of patient login — patients only (see LoginView).
    # Django's test runner automatically swaps EMAIL_BACKEND for an
    # in-memory one during `manage.py test` (captured in
    # django.core.mail.outbox), so these never hit real Gmail SMTP —
    # no @override_settings needed for that, unlike GOOGLE_MAPS_API_KEY/
    # GOOGLE_WEB_CLIENT_ID elsewhere, which aren't part of Django's own
    # testing-aware subsystems.

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

        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["otp-patient@example.com"])
        otp = EmailOTP.objects.get(user=self.user, used=False)
        self.assertEqual(len(otp.code), 6)
        self.assertTrue(otp.code.isdigit())
        self.assertIn(otp.code, mail.outbox[0].body)

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
        self.assertEqual(len(mail.outbox), 3)

    def test_resend_issues_a_new_code_and_invalidates_the_old_one(self):
        self._login()
        first_otp = EmailOTP.objects.get(user=self.user, used=False)

        response = self.client.post(self.resend_url, {"user_id": str(self.user.id)})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get("otp_required"))
        self.assertEqual(len(mail.outbox), 2)

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

    def test_non_patient_login_unaffected_by_otp(self):
        # Scope boundary: EMT/hospital/ambulance/mera_admin logins must
        # keep working exactly as before — immediate tokens, no OTP email.
        User.objects.create_user(
            email="emt-otp-check@example.com",
            password="TestPass123!",
            role=Role.EMT,
            full_name="Not An OTP Patient",
        )
        response = self.client.post(self.login_url, {
            "email": "emt-otp-check@example.com",
            "password": "TestPass123!",
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertNotIn("otp_required", response.data)
        self.assertEqual(len(mail.outbox), 0)


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

    def test_ambulance_reassignment_copies_identity_and_relinks_emts(self):
        url = reverse("admin-create-ambulance-admin")
        response = self.client.post(url, {
            "email": "new-amb@example.com",
            "password": "TestPass123!",
            "confirm_password": "TestPass123!",
            "admin_contact_name": "New Admin",
            "admin_phone": "0821111111",
            "successor_of": str(self.old_ambulance.id),
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
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        already_active_emt.refresh_from_db()
        self.assertTrue(already_active_emt.is_active)

    def test_reactivated_emt_can_actually_log_in_after_reassignment(self):
        # The real check the reassignment flow is supposed to deliver on:
        # not just an is_active flag flip, but genuine restored access.
        # Confirm login is actually rejected beforehand too, so this proves
        # reassignment *changed* something rather than login having always
        # worked regardless of is_active.
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
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        after = self.client.post(login_url, {
            "email": "legacy-emt@example.com", "password": "pass",
        })
        self.assertEqual(after.status_code, status.HTTP_200_OK)
        self.assertIn("access", after.data)
        self.assertIn("refresh", after.data)

    def test_hospital_reassignment_copies_identity_fields(self):
        url = reverse("admin-create-hospital-admin")
        response = self.client.post(url, {
            "email": "new-hosp@example.com",
            "password": "TestPass123!",
            "confirm_password": "TestPass123!",
            "admin_contact_name": "New Hospital Admin",
            "successor_of": str(self.old_hospital.id),
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

    def test_active_patient_can_still_log_in(self):
        # Guard against an overly-broad fix accidentally blocking everyone.
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

    def test_non_mera_admin_forbidden(self):
        self.client.force_authenticate(user=self.hospital)
        url = reverse("admin-user-reactivate", args=[self.ambulance.id])
        response = self.client.patch(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_reactivated_emt_can_actually_log_in(self):
        # Real check, not just the flag: login must actually fail before
        # reactivation and actually succeed after, via the real endpoint.
        login_url = reverse("login")

        before = self.client.post(login_url, {
            "email": "reactivate-emt1@example.com", "password": "pass",
        })
        self.assertEqual(before.status_code, status.HTTP_403_FORBIDDEN)

        reactivate_url = reverse("admin-user-reactivate", args=[self.emt1.id])
        response = self.client.patch(reactivate_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        after = self.client.post(login_url, {
            "email": "reactivate-emt1@example.com", "password": "pass",
        })
        self.assertEqual(after.status_code, status.HTTP_200_OK)
        self.assertIn("access", after.data)
        self.assertIn("refresh", after.data)
