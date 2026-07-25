# Tests for user registration, login, password reset, and role-based access.


from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from .models import InstitutionalStatus, Role, User


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

    def test_successful_login(self):
        response = self.client.post(self.url, {
            "email": "patient@example.com",
            "password": "TestPass123!",
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

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
