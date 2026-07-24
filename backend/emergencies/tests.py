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

    @patch("emergencies.tasks.auto_confirm_sos_task.apply_async")
    @patch("notifications.services.notify_emergency_contacts")
    @patch("notifications.services.notify_ambulance_services")
    def test_verified_patient_can_trigger_sos(self, mock_amb, mock_contacts, mock_task):
        patient = make_verified_patient()
        incident = services.trigger_sos(patient, {"latitude": -26.2, "longitude": 28.0, "priority_level": "high"})
        self.assertEqual(incident.status, IncidentStatus.PENDING_CONFIRMATION)
        mock_task.assert_called_once()

    def test_unverified_patient_cannot_trigger_sos(self):
        user = User.objects.create_user(
            email="unverified@test.com", password="pass", role=Role.PATIENT
        )
        with self.assertRaises(PermissionError):
            services.trigger_sos(user, {})


class SOSConfirmTest(TestCase):

    @patch("emergencies.services._broadcast_ws")
    @patch("notifications.services.notify_emergency_contacts")
    @patch("notifications.services.notify_ambulance_services")
    def test_confirm_transitions_to_active(self, mock_amb, mock_contacts, mock_ws):
        patient = make_verified_patient()
        incident = Incident.objects.create(
            patient=patient, status=IncidentStatus.PENDING_CONFIRMATION
        )
        services.confirm_sos(incident)
        incident.refresh_from_db()
        self.assertEqual(incident.status, IncidentStatus.ACTIVE)
        mock_contacts.assert_called_once()
        mock_amb.assert_called_once()


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
    @patch("notifications.services.notify_patient_ambulance_accepted")
    def test_accept_grants_medical_access(self, mock_notify, mock_ws):
        patient = make_verified_patient()
        ambulance = make_ambulance()
        incident = Incident.objects.create(
            patient=patient, status=IncidentStatus.ACTIVE
        )
        services.accept_incident(incident, ambulance_user=ambulance)
        incident.refresh_from_db()
        self.assertEqual(incident.status, IncidentStatus.DISPATCHED)
        self.assertEqual(incident.ambulance_service, ambulance)
        self.assertTrue(incident.medical_profile_access_granted)

    @patch("emergencies.services._broadcast_ws")
    @patch("notifications.services.notify_patient_ambulance_accepted")
    def test_complete_incident_revokes_medical_access(self, mock_notify, mock_ws):
        """NFR-04: Access revoked on completion."""
        patient = make_verified_patient()
        ambulance = make_ambulance()
        incident = Incident.objects.create(
            patient=patient, status=IncidentStatus.ACTIVE
        )
        services.accept_incident(incident, ambulance_user=ambulance)
        services.update_incident_status(incident, IncidentStatus.COMPLETED, actor=ambulance)
        incident.refresh_from_db()
        self.assertFalse(incident.medical_profile_access_granted)
