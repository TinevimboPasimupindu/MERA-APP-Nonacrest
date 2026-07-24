from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from accounts.models import User, Role, InstitutionalStatus
from medical_profiles.models import MedicalProfile, VerificationStatus
from .models import VerificationRequest, VerificationRequestStatus
from . import services


def make_patient(email="patient@test.com"):
    user = User.objects.create_user(email=email, password="pass", role=Role.PATIENT, full_name="Test Patient")
    profile = user.medical_profile
    profile.blood_type = "B+"
    profile.chronic_conditions = "Hypertension"
    profile.data_sharing_consent = True
    profile.verification_status = VerificationStatus.PENDING
    profile.save()
    return user


def make_hospital(email="hospital@test.com"):
    return User.objects.create_user(
        email=email, password="pass", role=Role.HOSPITAL,
        institutional_status=InstitutionalStatus.APPROVED,
        is_active=True, facility_name="Test Hospital",
    )


class VerificationApprovalTest(TestCase):
    # Approve sets profile to Verified and unlocks SOS.

    def test_approve_sets_verified(self):
        patient = make_patient()
        hospital = make_hospital()
        ver_req = VerificationRequest.objects.create(patient=patient, hospital=hospital)
        services.approve_verification(ver_req, reviewed_by=hospital)
        patient.medical_profile.refresh_from_db()
        self.assertEqual(patient.medical_profile.verification_status, VerificationStatus.VERIFIED)
        self.assertTrue(patient.medical_profile.sos_unlocked)


class VerificationFlagTest(TestCase):
    # Flag sends patient for in-person visit.

    def test_flag_updates_status(self):
        patient = make_patient()
        hospital = make_hospital()
        ver_req = VerificationRequest.objects.create(patient=patient, hospital=hospital)
        services.flag_verification(ver_req, reviewed_by=hospital, note="ID mismatch")
        ver_req.refresh_from_db()
        self.assertEqual(ver_req.status, VerificationRequestStatus.FLAGGED)
        self.assertEqual(ver_req.hospital_note, "ID mismatch")


class VerificationRequestMoreInfoTest(TestCase):
    # Request more info re-opens patient intake form.

    def test_request_info_updates_status(self):
        patient = make_patient()
        hospital = make_hospital()
        ver_req = VerificationRequest.objects.create(patient=patient, hospital=hospital)
        services.request_more_info(ver_req, reviewed_by=hospital, note="Missing allergy info")
        patient.medical_profile.refresh_from_db()
        self.assertEqual(patient.medical_profile.verification_status, VerificationStatus.INFO_REQUESTED)


class UrgencyBadgeTest(TestCase):
    # SLA urgency badges.

    def test_new_badge_within_24h(self):
        patient = make_patient()
        hospital = make_hospital()
        ver_req = VerificationRequest.objects.create(patient=patient, hospital=hospital)
        self.assertEqual(ver_req.urgency_badge, "new")
