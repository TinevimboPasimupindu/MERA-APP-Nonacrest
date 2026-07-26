from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from django.urls import reverse

from accounts.models import User, Role, InstitutionalStatus
from verification.models import VerificationRequest, VerificationRequestStatus
from .models import MedicalProfile, VerificationStatus


class MedicalProfileAutoCreateTest(TestCase):
    # Blank profile is created automatically on patient registration.

    def test_profile_created_on_patient_register(self):
        user = User.objects.create_user(
            email="auto@example.com", password="pass", role=Role.PATIENT
        )
        self.assertTrue(MedicalProfile.objects.filter(patient=user).exists())

    def test_profile_not_created_for_hospital(self):
        user = User.objects.create_user(
            email="hosp@example.com", password="pass", role=Role.HOSPITAL
        )
        self.assertFalse(MedicalProfile.objects.filter(patient=user).exists())


class MedicalIntakeFormTest(TestCase):
    # Patient submits and resubmits the intake form.

    def setUp(self):
        self.user = User.objects.create_user(
            email="p@example.com", password="pass", role=Role.PATIENT
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_submit_intake_form(self):
        response = self.client.put(reverse("medical-profile-submit"), {
            "blood_type": "O+",
            "chronic_conditions": "Type 2 Diabetes",
            "current_medications": "Metformin 500mg",
            "known_allergies": "Penicillin",
            "paramedic_notes": "Carries glucose tablets",
            "data_sharing_consent": True,
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        profile = self.user.medical_profile
        profile.refresh_from_db()
        self.assertEqual(profile.verification_status, VerificationStatus.PENDING)
        self.assertTrue(profile.data_sharing_consent)

    def test_patient_update_resets_to_pending(self):
        profile = self.user.medical_profile
        profile.verification_status = VerificationStatus.VERIFIED
        profile.save()
        self.client.put(reverse("medical-profile-submit"), {
            "blood_type": "A+",
            "data_sharing_consent": True,
        })
        profile.refresh_from_db()
        self.assertEqual(profile.verification_status, VerificationStatus.PENDING)


class ConsentTest(TestCase):
    # Patient can withdraw consent at any time.

    def setUp(self):
        self.user = User.objects.create_user(
            email="c@example.com", password="pass", role=Role.PATIENT
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        profile = self.user.medical_profile
        profile.grant_consent()

    def test_withdraw_consent(self):
        response = self.client.post(reverse("medical-profile-consent"), {"consent": False})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.medical_profile.refresh_from_db()
        self.assertFalse(self.user.medical_profile.data_sharing_consent)


class HospitalPatientListTest(TestCase):
    # Hospital Patient List screen (SC-13): all statuses, search, status filter.

    def setUp(self):
        self.hospital = User.objects.create_user(
            email="hosp@example.com", password="pass", role=Role.HOSPITAL,
            institutional_status=InstitutionalStatus.APPROVED,
            is_active=True, facility_name="Test Hospital",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.hospital)

        self.verified_patient = User.objects.create_user(
            email="verified@example.com", password="pass",
            role=Role.PATIENT, full_name="Amy Verified",
        )
        self.verified_patient.medical_profile.chronic_conditions = "Asthma"
        self.verified_patient.medical_profile.verification_status = VerificationStatus.VERIFIED
        self.verified_patient.medical_profile.save()
        VerificationRequest.objects.create(
            patient=self.verified_patient, hospital=self.hospital,
            status=VerificationRequestStatus.APPROVED,
        )

        self.pending_patient = User.objects.create_user(
            email="pending@example.com", password="pass",
            role=Role.PATIENT, full_name="Ben Pending",
        )
        self.pending_patient.medical_profile.verification_status = VerificationStatus.PENDING
        self.pending_patient.medical_profile.save()
        VerificationRequest.objects.create(
            patient=self.pending_patient, hospital=self.hospital,
            status=VerificationRequestStatus.PENDING,
        )

        # Different hospital entirely — must never show up in self.hospital's list.
        other_hospital = User.objects.create_user(
            email="other_hosp@example.com", password="pass", role=Role.HOSPITAL,
            institutional_status=InstitutionalStatus.APPROVED,
            is_active=True, facility_name="Other Hospital",
        )
        other_patient = User.objects.create_user(
            email="other@example.com", password="pass",
            role=Role.PATIENT, full_name="Cara Other",
        )
        VerificationRequest.objects.create(
            patient=other_patient, hospital=other_hospital,
            status=VerificationRequestStatus.PENDING,
        )

    def test_lists_all_statuses_for_this_hospital_only(self):
        response = self.client.get(reverse("medical-profile-patients"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = {row["patient_name"] for row in response.data}
        self.assertEqual(names, {"Amy Verified", "Ben Pending"})

    def test_filter_by_status(self):
        response = self.client.get(reverse("medical-profile-patients"), {"status": "verified"})
        names = {row["patient_name"] for row in response.data}
        self.assertEqual(names, {"Amy Verified"})

    def test_search_by_name(self):
        response = self.client.get(reverse("medical-profile-patients"), {"search": "ben"})
        names = {row["patient_name"] for row in response.data}
        self.assertEqual(names, {"Ben Pending"})

    def test_invalid_status_returns_400(self):
        response = self.client.get(reverse("medical-profile-patients"), {"status": "bogus"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
