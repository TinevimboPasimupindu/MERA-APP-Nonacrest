from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
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


class DashboardPatientListSyncTest(TestCase):
    # The hospital dashboard's flagged count (/verification/flagged/, reads
    # VerificationRequest) and the Patient List (/medical-profile/patients/,
    # reads MedicalProfile) must agree after every step: flag -> patient
    # edit -> resubmit to a different hospital.

    def setUp(self):
        self.patient = make_patient()
        self.hospital_a = make_hospital("a@test.com")
        self.hospital_b = make_hospital("b@test.com")
        self.patient_client = APIClient()
        self.patient_client.force_authenticate(user=self.patient)
        self.patient_client.post(
            reverse("verification-submit"), {"hospital_id": str(self.hospital_a.id)}
        )

    def _hospital_view(self, hospital):
        client = APIClient()
        client.force_authenticate(user=hospital)
        flagged = client.get(reverse("verification-flagged")).data
        patients = client.get(reverse("medical-profile-patients")).data
        flagged_ids = {row["patient_id"] for row in flagged}
        listed_flagged_ids = {
            row["patient_id"] for row in patients if row["verification_status"] == "flagged"
        }
        return flagged_ids, listed_flagged_ids, {row["patient_id"] for row in patients}

    def _assert_agree(self, hospital):
        flagged_ids, listed_flagged_ids, _ = self._hospital_view(hospital)
        self.assertEqual(flagged_ids, listed_flagged_ids)

    def test_flag_then_edit_then_resubmit_elsewhere(self):
        pid = str(self.patient.id)
        req = VerificationRequest.objects.get(patient=self.patient, hospital=self.hospital_a)

        # 1. Hospital A flags.
        services.flag_verification(req, reviewed_by=self.hospital_a, note="Bring ID")
        flagged_ids, _, _ = self._hospital_view(self.hospital_a)
        self.assertEqual(flagged_ids, {pid})
        self._assert_agree(self.hospital_a)

        # 2. Patient edits their profile: back to Pending on both records,
        #    and back in hospital A's queue.
        self.patient_client.patch(
            reverse("medical-profile-submit"),
            {"blood_type": "A+", "data_sharing_consent": True},
        )
        req.refresh_from_db()
        self.patient.medical_profile.refresh_from_db()
        self.assertEqual(req.status, VerificationRequestStatus.PENDING)
        self.assertEqual(self.patient.medical_profile.verification_status, VerificationStatus.PENDING)
        self._assert_agree(self.hospital_a)

        # 3. Hospital A flags again, then the patient resubmits to hospital B.
        services.flag_verification(req, reviewed_by=self.hospital_a, note="Still need ID")
        self.patient_client.post(
            reverse("verification-submit"), {"hospital_id": str(self.hospital_b.id)}
        )
        req.refresh_from_db()
        self.assertEqual(req.status, VerificationRequestStatus.WITHDRAWN)
        flagged_a, _, listed_a = self._hospital_view(self.hospital_a)
        self.assertEqual(flagged_a, set())
        self.assertNotIn(pid, listed_a)
        _, _, listed_b = self._hospital_view(self.hospital_b)
        self.assertIn(pid, listed_b)
        self._assert_agree(self.hospital_a)
        self._assert_agree(self.hospital_b)


class ResubmitWithdrawsAllLiveRequestsTest(TestCase):

    def test_resubmit_withdraws_flagged_and_approved(self):
        patient = make_patient()
        hospital_a = make_hospital("a@test.com")
        hospital_b = make_hospital("b@test.com")
        flagged = VerificationRequest.objects.create(
            patient=patient, hospital=hospital_a, status=VerificationRequestStatus.FLAGGED,
        )
        approved = VerificationRequest.objects.create(
            patient=patient, hospital=hospital_a, status=VerificationRequestStatus.APPROVED,
        )
        new = services.submit_to_hospital(patient, hospital_b)
        flagged.refresh_from_db()
        approved.refresh_from_db()
        self.assertEqual(flagged.status, VerificationRequestStatus.WITHDRAWN)
        self.assertEqual(approved.status, VerificationRequestStatus.WITHDRAWN)
        self.assertEqual(new.status, VerificationRequestStatus.PENDING)
        patient.medical_profile.refresh_from_db()
        self.assertEqual(patient.medical_profile.verification_status, VerificationStatus.PENDING)

    def test_hospital_cannot_act_on_withdrawn_request(self):
        patient = make_patient()
        hospital = make_hospital()
        req = VerificationRequest.objects.create(
            patient=patient, hospital=hospital, status=VerificationRequestStatus.WITHDRAWN,
        )
        client = APIClient()
        client.force_authenticate(user=hospital)
        response = client.post(reverse("verification-action", args=[req.id]), {"action": "approve"})
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        patient.medical_profile.refresh_from_db()
        self.assertEqual(patient.medical_profile.verification_status, VerificationStatus.PENDING)


class BackfillVerificationStatusTest(TestCase):
    # Repairs profiles corrupted by the old auto-verify in submit_by_patient().

    def _run(self, *args):
        out = StringIO()
        call_command("backfill_verification_status", *args, stdout=out)
        return out.getvalue()

    def _auto_verified(self, patient):
        # What the old submit_by_patient() left behind: Verified, no verified_by.
        profile = patient.medical_profile
        profile.verification_status = VerificationStatus.VERIFIED
        profile.verified_at = timezone.now()
        profile.save()

    def test_backfill_from_latest_request(self):
        hospital = make_hospital()
        flagged_patient = make_patient("f@test.com")
        VerificationRequest.objects.create(
            patient=flagged_patient, hospital=hospital, status=VerificationRequestStatus.FLAGGED,
        )
        self._auto_verified(flagged_patient)

        no_request_patient = make_patient("n@test.com")
        self._auto_verified(no_request_patient)

        approved_patient = make_patient("a@test.com")
        VerificationRequest.objects.create(
            patient=approved_patient, hospital=hospital,
            status=VerificationRequestStatus.APPROVED, reviewed_by=hospital,
        )
        self._auto_verified(approved_patient)

        self._run()

        for patient, expected in (
            (flagged_patient, VerificationStatus.FLAGGED),
            (no_request_patient, VerificationStatus.PENDING),
            (approved_patient, VerificationStatus.VERIFIED),
        ):
            patient.medical_profile.refresh_from_db()
            self.assertEqual(patient.medical_profile.verification_status, expected)
        self.assertIsNone(flagged_patient.medical_profile.verified_at)
        self.assertEqual(approved_patient.medical_profile.verified_by, hospital)

        self.assertIn("Updated 0 profile(s); withdrew 0", self._run())  # idempotent

    def test_backfill_withdraws_stale_requests(self):
        patient = make_patient()
        hospital_a = make_hospital("a@test.com")
        hospital_b = make_hospital("b@test.com")
        stale = VerificationRequest.objects.create(
            patient=patient, hospital=hospital_a, status=VerificationRequestStatus.FLAGGED,
            submitted_at=timezone.now() - timedelta(days=2),
        )
        VerificationRequest.objects.create(
            patient=patient, hospital=hospital_b, status=VerificationRequestStatus.PENDING,
        )
        self._run()
        stale.refresh_from_db()
        self.assertEqual(stale.status, VerificationRequestStatus.WITHDRAWN)

    def test_dry_run_writes_nothing(self):
        patient = make_patient()
        self._auto_verified(patient)
        output = self._run("--dry-run")
        self.assertIn("verified -> pending", output)
        patient.medical_profile.refresh_from_db()
        self.assertEqual(patient.medical_profile.verification_status, VerificationStatus.VERIFIED)


class RequestMoreInfoEndToEndTest(TestCase):
    # Hospital asks → patient sees the note → patient updates + replies →
    # back in the hospital's queue with the question and answer attached.

    def setUp(self):
        self.patient = make_patient("info-e2e@test.com")
        self.hospital = make_hospital("info-e2e-hosp@test.com")
        self.patient_client = APIClient()
        self.patient_client.force_authenticate(user=self.patient)
        self.hospital_client = APIClient()
        self.hospital_client.force_authenticate(user=self.hospital)
        self.patient_client.post(reverse("verification-submit"), {"hospital_id": str(self.hospital.id)})
        self.req = VerificationRequest.objects.get(patient=self.patient)

    def _hospital_requests_info(self, note="Please list the dosage of your medications."):
        response = self.hospital_client.post(
            reverse("verification-action", args=[self.req.id]),
            {"action": "request_info", "note": note},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def _patient_resubmits(self, **extra):
        return self.patient_client.patch(reverse("medical-profile-submit"), {
            "blood_type": "B+", "chronic_conditions": "Hypertension",
            "current_medications": "Amlodipine 5mg daily", "known_allergies": "None",
            "paramedic_notes": "", "data_sharing_consent": True, **extra,
        })

    def test_full_round_trip(self):
        self._hospital_requests_info()

        # Patient sees the request and the hospital's note.
        mine = self.patient_client.get(reverse("verification-my-status")).data
        self.assertEqual(mine["status"], "info_requested")
        self.assertEqual(mine["hospital_note"], "Please list the dosage of your medications.")

        # It's waiting on the patient, so it's not ready for the hospital yet.
        queue = self.hospital_client.get(reverse("verification-queue")).data
        self.assertEqual(queue[0]["status"], "info_requested")
        self.assertIsNone(queue[0]["patient_responded_at"])

        response = self._patient_resubmits(response_to_hospital="It's 5mg once a day.")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.req.refresh_from_db()
        self.assertEqual(self.req.status, VerificationRequestStatus.PENDING)
        self.assertEqual(self.req.patient_response, "It's 5mg once a day.")
        self.assertIsNotNone(self.req.patient_responded_at)
        self.patient.medical_profile.refresh_from_db()
        self.assertEqual(self.patient.medical_profile.verification_status, VerificationStatus.PENDING)

        # Back in the hospital's queue, marked as a response.
        queue = self.hospital_client.get(reverse("verification-queue")).data
        self.assertEqual(queue[0]["status"], "pending")
        self.assertIsNotNone(queue[0]["patient_responded_at"])

        # Re-review shows the question, the answer, and the updated field.
        review = self.hospital_client.get(reverse("verification-review", args=[self.req.id])).data
        self.assertEqual(review["current_medications"], "Amlodipine 5mg daily")
        self.assertEqual(review["request"]["hospital_note"], "Please list the dosage of your medications.")
        self.assertEqual(review["request"]["patient_response"], "It's 5mg once a day.")

        # And the hospital can complete the review.
        response = self.hospital_client.post(
            reverse("verification-action", args=[self.req.id]), {"action": "approve"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.patient.medical_profile.refresh_from_db()
        self.assertEqual(self.patient.medical_profile.verification_status, VerificationStatus.VERIFIED)

    def test_reply_is_optional(self):
        self._hospital_requests_info()
        response = self._patient_resubmits()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.req.refresh_from_db()
        self.assertEqual(self.req.status, VerificationRequestStatus.PENDING)
        self.assertEqual(self.req.patient_response, "")
        self.assertIsNotNone(self.req.patient_responded_at)

    def test_second_request_clears_previous_answer(self):
        self._hospital_requests_info()
        self._patient_resubmits(response_to_hospital="First answer")
        self._hospital_requests_info(note="Also add your allergies.")
        self.req.refresh_from_db()
        self.assertEqual(self.req.hospital_note, "Also add your allergies.")
        self.assertEqual(self.req.patient_response, "")
        self.assertIsNone(self.req.patient_responded_at)

    def test_edit_without_pending_info_request_is_not_a_response(self):
        # Ordinary edits (e.g. while pending) don't stamp a response.
        self._patient_resubmits(response_to_hospital="unsolicited")
        self.req.refresh_from_db()
        self.assertEqual(self.req.patient_response, "")
        self.assertIsNone(self.req.patient_responded_at)
