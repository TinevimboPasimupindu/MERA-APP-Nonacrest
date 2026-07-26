from unittest.mock import patch

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import InstitutionalStatus, Role, User
from medical_profiles.models import VerificationStatus
from .models import Incident, IncidentStatus
from . import services


def make_verified_patient(email="p@test.com"):
    user = User.objects.create_user(
        email=email, password="pass", role=Role.PATIENT, full_name="Test Patient"
    )
    profile = user.medical_profile
    profile.verification_status = VerificationStatus.VERIFIED
    profile.data_sharing_consent = True
    profile.save()
    return user


def make_ambulance(email="amb@test.com"):
    return User.objects.create_user(
        email=email, password="pass",
        role=Role.AMBULANCE_SERVICE,
        institutional_status=InstitutionalStatus.APPROVED,
        is_active=True, is_available=True,
        service_name="Test EMS",
    )


class SOSTriggerTest(TestCase):

    # No mocks needed here — trigger_sos() only creates the incident and logs;
    # it doesn't call _notify (that's confirm_sos) and there's no tasks module
    # to schedule against (Celery was removed for this prototype — see
    # mera_backend/__init__.py — so auto-confirm-via-background-task isn't built).
    def test_verified_patient_can_trigger_sos(self):
        patient = make_verified_patient()
        incident = services.trigger_sos(patient, {"latitude": -26.2, "longitude": 28.0, "priority_level": "high"})
        self.assertEqual(incident.status, IncidentStatus.PENDING_CONFIRMATION)

    def test_unverified_patient_cannot_trigger_sos(self):
        user = User.objects.create_user(
            email="unverified@test.com", password="pass", role=Role.PATIENT
        )
        with self.assertRaises(PermissionError):
            services.trigger_sos(user, {})


class SOSConfirmTest(TestCase):

    @patch("emergencies.services._broadcast_ws")
    @patch("emergencies.services._notify")
    def test_confirm_transitions_to_active(self, mock_notify, mock_ws):
        patient = make_verified_patient()
        incident = Incident.objects.create(
            patient=patient, status=IncidentStatus.PENDING_CONFIRMATION
        )
        services.confirm_sos(incident)
        incident.refresh_from_db()
        self.assertEqual(incident.status, IncidentStatus.ACTIVE)
        # confirm_sos() calls the shared _notify() stub twice — once for
        # emergency contacts, once for ambulance services (see services.py).
        self.assertEqual(mock_notify.call_count, 2)


class SOSCancelTest(TestCase):

    @patch("emergencies.services._broadcast_ws")
    def test_cancel_active_incident(self, mock_ws):
        patient = make_verified_patient()
        incident = Incident.objects.create(
            patient=patient, status=IncidentStatus.ACTIVE
        )
        services.cancel_incident(incident, cancelled_by=patient, reason="False alarm")
        incident.refresh_from_db()
        self.assertEqual(incident.status, IncidentStatus.CANCELLED)
        self.assertFalse(incident.medical_profile_access_granted)

    def test_cannot_cancel_completed_incident(self):
        patient = make_verified_patient()
        incident = Incident.objects.create(
            patient=patient, status=IncidentStatus.COMPLETED
        )
        with self.assertRaises(ValueError):
            services.cancel_incident(incident, cancelled_by=patient)


class AcceptIncidentTest(TestCase):

    @patch("emergencies.services._broadcast_ws")
    @patch("emergencies.services._notify")
    def test_accept_grants_medical_access(self, mock_notify, mock_ws):
        patient = make_verified_patient()
        ambulance = make_ambulance()
        incident = Incident.objects.create(
            patient=patient, status=IncidentStatus.ACTIVE
        )
        services.accept_incident(incident, ambulance_service=ambulance, actor=ambulance)
        incident.refresh_from_db()
        self.assertEqual(incident.status, IncidentStatus.DISPATCHED)
        self.assertEqual(incident.ambulance_service, ambulance)
        self.assertTrue(incident.medical_profile_access_granted)

    @patch("emergencies.services._broadcast_ws")
    @patch("emergencies.services._notify")
    def test_complete_incident_revokes_medical_access(self, mock_notify, mock_ws):
        """NFR-04: Access revoked on completion."""
        patient = make_verified_patient()
        ambulance = make_ambulance()
        incident = Incident.objects.create(
            patient=patient, status=IncidentStatus.ACTIVE
        )
        services.accept_incident(incident, ambulance_service=ambulance, actor=ambulance)
        services.update_incident_status(incident, IncidentStatus.COMPLETED, actor=ambulance)
        incident.refresh_from_db()
        self.assertFalse(incident.medical_profile_access_granted)


class EMTIncidentAttributionTest(TestCase):
    # EMT-accepted incidents must attribute to the EMT's ambulance_admin,
    # not the EMT's own account — see PROJECT_CONTEXT.md "emergencies" entry.

    def setUp(self):
        self.ambulance_admin = make_ambulance(email="admin@test.com")
        self.emt = User.objects.create_user(
            email="emt@test.com", password="pass", role=Role.EMT,
            full_name="Test EMT", ambulance_service=self.ambulance_admin,
        )
        self.patient = make_verified_patient()
        self.incident = Incident.objects.create(patient=self.patient, status=IncidentStatus.ACTIVE)
        self.client = APIClient()

    @patch("emergencies.services._broadcast_ws")
    @patch("emergencies.services._notify")
    def test_emt_accept_attributes_incident_to_ambulance_admin(self, mock_notify, mock_ws):
        self.client.force_authenticate(user=self.emt)
        response = self.client.post(f"/api/incidents/{self.incident.id}/accept/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.incident.refresh_from_db()
        self.assertEqual(self.incident.ambulance_service_id, self.ambulance_admin.id)
        self.assertNotEqual(self.incident.ambulance_service_id, self.emt.id)

    @patch("emergencies.services._broadcast_ws")
    @patch("emergencies.services._notify")
    def test_ambulance_admin_my_responses_includes_emt_accepted_incident(self, mock_notify, mock_ws):
        self.client.force_authenticate(user=self.emt)
        self.client.post(f"/api/incidents/{self.incident.id}/accept/")

        self.client.force_authenticate(user=self.ambulance_admin)
        response = self.client.get("/api/incidents/my_responses/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [row["id"] for row in response.data]
        self.assertIn(str(self.incident.id), ids)

    @patch("emergencies.services._broadcast_ws")
    @patch("emergencies.services._notify")
    def test_same_emt_can_update_status_after_accepting(self, mock_notify, mock_ws):
        self.client.force_authenticate(user=self.emt)
        self.client.post(f"/api/incidents/{self.incident.id}/accept/")

        response = self.client.post(
            f"/api/incidents/{self.incident.id}/update_status/",
            {"status": "on_the_way"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.incident.refresh_from_db()
        self.assertEqual(self.incident.status, IncidentStatus.ON_THE_WAY)

    @patch("emergencies.services._broadcast_ws")
    @patch("emergencies.services._notify")
    def test_same_emt_can_submit_treatment_notes_after_accepting(self, mock_notify, mock_ws):
        self.client.force_authenticate(user=self.emt)
        self.client.post(f"/api/incidents/{self.incident.id}/accept/")

        response = self.client.post(
            f"/api/incidents/{self.incident.id}/treatment_notes/",
            {"chief_complaint": "Chest pain", "treatment_administered": "Oxygen, aspirin"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    @patch("emergencies.services._broadcast_ws")
    @patch("emergencies.services._notify")
    def test_different_emt_on_same_crew_can_view_medical_detail(self, mock_notify, mock_ws):
        teammate_emt = User.objects.create_user(
            email="teammate@test.com", password="pass", role=Role.EMT,
            full_name="Teammate EMT", ambulance_service=self.ambulance_admin,
        )
        self.client.force_authenticate(user=self.emt)
        self.client.post(f"/api/incidents/{self.incident.id}/accept/")

        self.client.force_authenticate(user=teammate_emt)
        response = self.client.get(f"/api/incidents/{self.incident.id}/medical_detail/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_emt_with_no_linked_ambulance_service_gets_400_not_crash(self):
        orphan_emt = User.objects.create_user(
            email="orphan@test.com", password="pass", role=Role.EMT, full_name="Orphan EMT",
        )
        self.client.force_authenticate(user=orphan_emt)
        response = self.client.post(f"/api/incidents/{self.incident.id}/accept/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("emergencies.services._broadcast_ws")
    @patch("emergencies.services._notify")
    def test_ambulance_admin_accept_still_works_directly(self, mock_notify, mock_ws):
        # Regression guard: non-EMT accept behavior is unchanged.
        self.client.force_authenticate(user=self.ambulance_admin)
        response = self.client.post(f"/api/incidents/{self.incident.id}/accept/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.incident.refresh_from_db()
        self.assertEqual(self.incident.ambulance_service_id, self.ambulance_admin.id)
