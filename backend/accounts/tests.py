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
