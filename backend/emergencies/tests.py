from datetime import timedelta
from decimal import Decimal
from unittest.mock import Mock, patch

from django.test import TestCase, override_settings
from django.utils import timezone
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

    # Product decision: a patient can now cancel through and including
    # ON_THE_WAY (previously cancellation was blocked the moment an
    # ambulance was even assigned) — but not once ARRIVED_ON_SCENE, since
    # only the crew on scene can assess/resolve from that point on. See
    # PROJECT_CONTEXT.md for the full reasoning.

    @patch("emergencies.services._broadcast_ws")
    @patch("emergencies.services._notify")
    def test_cancel_dispatched_incident(self, mock_notify, mock_ws):
        patient = make_verified_patient()
        ambulance = make_ambulance()
        incident = Incident.objects.create(patient=patient, status=IncidentStatus.ACTIVE)
        services.accept_incident(incident, ambulance_service=ambulance, actor=ambulance)
        incident.refresh_from_db()
        self.assertEqual(incident.status, IncidentStatus.DISPATCHED)

        services.cancel_incident(incident, cancelled_by=patient, reason="No longer needed")
        incident.refresh_from_db()
        self.assertEqual(incident.status, IncidentStatus.CANCELLED)
        self.assertFalse(incident.medical_profile_access_granted)

    @patch("emergencies.services._broadcast_ws")
    @patch("emergencies.services._notify")
    def test_cancel_on_the_way_incident(self, mock_notify, mock_ws):
        patient = make_verified_patient()
        ambulance = make_ambulance()
        incident = Incident.objects.create(patient=patient, status=IncidentStatus.ACTIVE)
        services.accept_incident(incident, ambulance_service=ambulance, actor=ambulance)
        services.update_incident_status(incident, IncidentStatus.ON_THE_WAY, actor=ambulance)
        incident.refresh_from_db()
        self.assertEqual(incident.status, IncidentStatus.ON_THE_WAY)

        services.cancel_incident(incident, cancelled_by=patient, reason="False alarm")
        incident.refresh_from_db()
        self.assertEqual(incident.status, IncidentStatus.CANCELLED)
        self.assertFalse(incident.medical_profile_access_granted)

    @patch("emergencies.services._broadcast_ws")
    @patch("emergencies.services._notify")
    def test_cannot_cancel_arrived_on_scene_incident(self, mock_notify, mock_ws):
        patient = make_verified_patient()
        ambulance = make_ambulance()
        incident = Incident.objects.create(patient=patient, status=IncidentStatus.ACTIVE)
        services.accept_incident(incident, ambulance_service=ambulance, actor=ambulance)
        services.update_incident_status(incident, IncidentStatus.ARRIVED_ON_SCENE, actor=ambulance)
        incident.refresh_from_db()
        self.assertEqual(incident.status, IncidentStatus.ARRIVED_ON_SCENE)

        with self.assertRaises(ValueError):
            services.cancel_incident(incident, cancelled_by=patient)
        incident.refresh_from_db()
        self.assertEqual(incident.status, IncidentStatus.ARRIVED_ON_SCENE)


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


# Live location tracking + routing (maps feature)

class UpdateLocationTest(TestCase):
    # PATCH /incidents/{id}/update_location/ — ownership-scoped the same
    # way as select_hospital/update_status/treatment_notes (see
    # _get_assigned_incident in views.py).

    def setUp(self):
        self.patient = make_verified_patient()
        self.ambulance = make_ambulance()
        self.other_ambulance = make_ambulance(email="other_amb@test.com")
        self.incident = Incident.objects.create(
            patient=self.patient,
            status=IncidentStatus.DISPATCHED,
            ambulance_service=self.ambulance,
        )
        self.client = APIClient()

    def test_assigned_ambulance_can_update_location(self):
        self.client.force_authenticate(user=self.ambulance)
        response = self.client.patch(
            f"/api/incidents/{self.incident.id}/update_location/",
            {"ambulance_lat": -26.19, "ambulance_lng": 28.03},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.incident.refresh_from_db()
        self.assertAlmostEqual(self.incident.ambulance_lat, -26.19)
        self.assertAlmostEqual(self.incident.ambulance_lng, 28.03)

    def test_emt_on_assigned_crew_can_update_location(self):
        # Same effective_ambulance_service resolution as accept()/
        # update_status() — any EMT on the assigned crew, not just whoever
        # accepted, can send location pings.
        emt = User.objects.create_user(
            email="crew_emt@test.com", password="pass", role=Role.EMT,
            full_name="Crew EMT", ambulance_service=self.ambulance,
        )
        self.client.force_authenticate(user=emt)
        response = self.client.patch(
            f"/api/incidents/{self.incident.id}/update_location/",
            {"ambulance_lat": -26.2, "ambulance_lng": 28.05},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.incident.refresh_from_db()
        self.assertAlmostEqual(self.incident.ambulance_lat, -26.2)

    def test_unassigned_ambulance_cannot_update_location(self):
        self.client.force_authenticate(user=self.other_ambulance)
        response = self.client.patch(
            f"/api/incidents/{self.incident.id}/update_location/",
            {"ambulance_lat": -26.19, "ambulance_lng": 28.03},
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.incident.refresh_from_db()
        self.assertIsNone(self.incident.ambulance_lat)

    def test_patient_cannot_update_location(self):
        self.client.force_authenticate(user=self.patient)
        response = self.client.patch(
            f"/api/incidents/{self.incident.id}/update_location/",
            {"ambulance_lat": -26.19, "ambulance_lng": 28.03},
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_missing_fields_rejected(self):
        self.client.force_authenticate(user=self.ambulance)
        response = self.client.patch(f"/api/incidents/{self.incident.id}/update_location/", {})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_out_of_range_coordinates_rejected(self):
        self.client.force_authenticate(user=self.ambulance)
        response = self.client.patch(
            f"/api/incidents/{self.incident.id}/update_location/",
            {"ambulance_lat": 200, "ambulance_lng": 28.03},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class PatientStatusIncludesAmbulanceLocationTest(TestCase):
    # GET /incidents/{id}/ is what the mobile patient app's
    # emergency-active.tsx tracking screen polls (SC-06) — confirms
    # ambulance_lat/lng show up there once set, and are null before that.

    def test_ambulance_location_appears_once_set_via_patient_status_endpoint(self):
        patient = make_verified_patient()
        ambulance = make_ambulance()
        incident = Incident.objects.create(
            patient=patient, status=IncidentStatus.DISPATCHED, ambulance_service=ambulance,
        )
        client = APIClient()

        client.force_authenticate(user=patient)
        response = client.get(f"/api/incidents/{incident.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["ambulance_lat"])
        self.assertIsNone(response.data["ambulance_lng"])

        client.force_authenticate(user=ambulance)
        update_response = client.patch(
            f"/api/incidents/{incident.id}/update_location/",
            {"ambulance_lat": -26.15, "ambulance_lng": 28.02},
        )
        self.assertEqual(update_response.status_code, status.HTTP_200_OK)

        client.force_authenticate(user=patient)
        response = client.get(f"/api/incidents/{incident.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertAlmostEqual(response.data["ambulance_lat"], -26.15)
        self.assertAlmostEqual(response.data["ambulance_lng"], 28.02)


class RouteEndpointTest(TestCase):
    # GET /incidents/{id}/route/ — server-side Google Routes API call.
    # The real Google API is never hit in tests: emergencies.services.httpx
    # .post is mocked directly, so no network call happens and no quota is
    # spent. Each test builds a fake httpx.Response-shaped Mock (just the
    # two methods services.get_route() actually calls: .raise_for_status()
    # and .json()) rather than a real httpx.Response, since the service
    # code never touches anything else on the response object.

    def setUp(self):
        self.patient = make_verified_patient()
        self.ambulance = make_ambulance()
        self.other_patient = make_verified_patient(email="other_patient@test.com")
        self.other_ambulance = make_ambulance(email="other_amb@test.com")
        self.incident = Incident.objects.create(
            patient=self.patient,
            status=IncidentStatus.DISPATCHED,
            ambulance_service=self.ambulance,
            latitude=Decimal("-26.204100"),
            longitude=Decimal("28.047300"),
        )
        self.client = APIClient()

    @staticmethod
    def _mock_google_response():
        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_response.json.return_value = {
            "routes": [{
                "distanceMeters": 5230,
                "duration": "612s",
                "polyline": {"encodedPolyline": "abc123xyz"},
            }]
        }
        return mock_response

    def _set_ambulance_location(self):
        self.incident.ambulance_lat = -26.19
        self.incident.ambulance_lng = 28.03
        self.incident.save(update_fields=["ambulance_lat", "ambulance_lng"])

    @override_settings(GOOGLE_MAPS_API_KEY="test-key-123")
    @patch("emergencies.services.httpx.post")
    def test_patient_gets_route_once_ambulance_location_set(self, mock_post):
        mock_post.return_value = self._mock_google_response()
        self._set_ambulance_location()

        self.client.force_authenticate(user=self.patient)
        response = self.client.get(f"/api/incidents/{self.incident.id}/route/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["available"])
        self.assertEqual(response.data["distance_meters"], 5230)
        self.assertEqual(response.data["duration_seconds"], 612)
        self.assertEqual(response.data["polyline"], "abc123xyz")
        mock_post.assert_called_once()

    @override_settings(GOOGLE_MAPS_API_KEY="test-key-123")
    @patch("emergencies.services.httpx.post")
    def test_route_request_only_uses_basic_tier_fields_and_key_stays_in_header(self, mock_post):
        # The API key must only ever travel server-side, in a header — never
        # in the request body/URL (which would risk it leaking into logs)
        # and never in the response returned to the client. Also confirms
        # only Basic-tier fields are requested (no traffic/travelAdvisory),
        # which is what keeps this call in Google's cheaper pricing tier.
        mock_post.return_value = self._mock_google_response()
        self._set_ambulance_location()

        self.client.force_authenticate(user=self.patient)
        response = self.client.get(f"/api/incidents/{self.incident.id}/route/")

        _, call_kwargs = mock_post.call_args
        self.assertEqual(call_kwargs["headers"]["X-Goog-Api-Key"], "test-key-123")
        field_mask = call_kwargs["headers"]["X-Goog-FieldMask"]
        self.assertNotIn("travelAdvisory", field_mask)
        self.assertNotIn("traffic", field_mask.lower())
        payload = call_kwargs["json"]
        self.assertNotIn("test-key-123", str(payload))
        self.assertNotIn("api_key", str(response.data).lower())
        self.assertNotIn("test-key-123", str(response.data))

    @override_settings(GOOGLE_MAPS_API_KEY="test-key-123")
    @patch("emergencies.services.httpx.post")
    def test_route_accessible_to_assigned_ambulance(self, mock_post):
        mock_post.return_value = self._mock_google_response()
        self._set_ambulance_location()

        self.client.force_authenticate(user=self.ambulance)
        response = self.client.get(f"/api/incidents/{self.incident.id}/route/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["available"])

    @override_settings(GOOGLE_MAPS_API_KEY="test-key-123")
    @patch("emergencies.services.httpx.post")
    def test_route_accessible_to_emt_on_assigned_crew(self, mock_post):
        mock_post.return_value = self._mock_google_response()
        self._set_ambulance_location()
        emt = User.objects.create_user(
            email="route_emt@test.com", password="pass", role=Role.EMT,
            full_name="Route EMT", ambulance_service=self.ambulance,
        )

        self.client.force_authenticate(user=emt)
        response = self.client.get(f"/api/incidents/{self.incident.id}/route/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["available"])

    def test_route_forbidden_for_unrelated_patient(self):
        self.client.force_authenticate(user=self.other_patient)
        response = self.client.get(f"/api/incidents/{self.incident.id}/route/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_route_forbidden_for_unrelated_ambulance(self):
        self.client.force_authenticate(user=self.other_ambulance)
        response = self.client.get(f"/api/incidents/{self.incident.id}/route/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @patch("emergencies.services.httpx.post")
    def test_route_handles_missing_ambulance_location_gracefully(self, mock_post):
        # ambulance_lat/lng never set — must not crash, and must not even
        # attempt the Google call (nothing useful to route yet).
        self.client.force_authenticate(user=self.patient)
        response = self.client.get(f"/api/incidents/{self.incident.id}/route/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["available"])
        mock_post.assert_not_called()

    @patch("emergencies.services.httpx.post")
    def test_route_handles_missing_patient_location_gracefully(self, mock_post):
        self.incident.latitude = None
        self.incident.longitude = None
        self.incident.save(update_fields=["latitude", "longitude"])
        self._set_ambulance_location()

        self.client.force_authenticate(user=self.patient)
        response = self.client.get(f"/api/incidents/{self.incident.id}/route/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["available"])
        mock_post.assert_not_called()

    @override_settings(GOOGLE_MAPS_API_KEY="test-key-123")
    @patch("emergencies.services.httpx.post")
    def test_route_handles_google_api_failure_gracefully(self, mock_post):
        mock_post.side_effect = Exception("network boom")
        self._set_ambulance_location()

        self.client.force_authenticate(user=self.patient)
        response = self.client.get(f"/api/incidents/{self.incident.id}/route/")
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    @override_settings(GOOGLE_MAPS_API_KEY="")
    @patch("emergencies.services.httpx.post")
    def test_route_handles_unconfigured_api_key_gracefully(self, mock_post):
        # No real GOOGLE_MAPS_API_KEY set in the environment — must not crash.
        self._set_ambulance_location()

        self.client.force_authenticate(user=self.patient)
        response = self.client.get(f"/api/incidents/{self.incident.id}/route/")
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        mock_post.assert_not_called()


class MyActiveIncidentTest(TestCase):
    # GET /incidents/my_active/ — SC-01 app-launch restore. "In progress"
    # means not COMPLETED/CANCELLED; PENDING_CONFIRMATION counts too (a
    # patient's SOS should still restore even if the confirm step hasn't
    # landed yet).

    def setUp(self):
        self.patient = make_verified_patient()
        self.ambulance = make_ambulance()
        self.client = APIClient()

    def test_patient_with_no_incidents_gets_none(self):
        self.client.force_authenticate(user=self.patient)
        response = self.client.get("/api/incidents/my_active/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["active_incident"])

    def test_patient_with_active_incident_gets_it_back(self):
        incident = Incident.objects.create(patient=self.patient, status=IncidentStatus.ACTIVE)
        self.client.force_authenticate(user=self.patient)
        response = self.client.get("/api/incidents/my_active/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(response.data["active_incident"])
        self.assertEqual(response.data["active_incident"]["id"], str(incident.id))

    def test_patient_pending_confirmation_counts_as_active(self):
        incident = Incident.objects.create(
            patient=self.patient, status=IncidentStatus.PENDING_CONFIRMATION
        )
        self.client.force_authenticate(user=self.patient)
        response = self.client.get("/api/incidents/my_active/")
        self.assertEqual(response.data["active_incident"]["id"], str(incident.id))

    def test_patient_with_only_completed_incident_gets_none(self):
        Incident.objects.create(patient=self.patient, status=IncidentStatus.COMPLETED)
        self.client.force_authenticate(user=self.patient)
        response = self.client.get("/api/incidents/my_active/")
        self.assertIsNone(response.data["active_incident"])

    def test_patient_with_only_cancelled_incident_gets_none(self):
        Incident.objects.create(patient=self.patient, status=IncidentStatus.CANCELLED)
        self.client.force_authenticate(user=self.patient)
        response = self.client.get("/api/incidents/my_active/")
        self.assertIsNone(response.data["active_incident"])

    def test_patient_gets_most_recently_triggered_active_incident(self):
        older = Incident.objects.create(
            patient=self.patient, status=IncidentStatus.ACTIVE,
            triggered_at=timezone.now() - timedelta(minutes=10),
        )
        newer = Incident.objects.create(patient=self.patient, status=IncidentStatus.DISPATCHED)
        self.client.force_authenticate(user=self.patient)
        response = self.client.get("/api/incidents/my_active/")
        self.assertEqual(response.data["active_incident"]["id"], str(newer.id))
        self.assertNotEqual(response.data["active_incident"]["id"], str(older.id))

    def test_patients_active_incident_not_leaked_to_another_patient(self):
        Incident.objects.create(patient=self.patient, status=IncidentStatus.ACTIVE)
        other_patient = make_verified_patient(email="other@test.com")
        self.client.force_authenticate(user=other_patient)
        response = self.client.get("/api/incidents/my_active/")
        self.assertIsNone(response.data["active_incident"])

    def test_ambulance_with_one_assigned_incident_gets_it_back(self):
        incident = Incident.objects.create(
            patient=self.patient, status=IncidentStatus.DISPATCHED, ambulance_service=self.ambulance,
        )
        self.client.force_authenticate(user=self.ambulance)
        response = self.client.get("/api/incidents/my_active/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["active_incident"]["id"], str(incident.id))

    def test_ambulance_with_no_assigned_incidents_gets_none(self):
        self.client.force_authenticate(user=self.ambulance)
        response = self.client.get("/api/incidents/my_active/")
        self.assertIsNone(response.data["active_incident"])

    def test_ambulance_with_only_completed_incident_gets_none(self):
        Incident.objects.create(
            patient=self.patient, status=IncidentStatus.COMPLETED, ambulance_service=self.ambulance,
        )
        self.client.force_authenticate(user=self.ambulance)
        response = self.client.get("/api/incidents/my_active/")
        self.assertIsNone(response.data["active_incident"])

    def test_ambulance_with_two_concurrent_incidents_is_ambiguous_and_gets_none(self):
        # Service-level attribution can't tell which of two simultaneously
        # active incidents belongs to which specific EMT — see the comment
        # in views.py. Ambiguous must NOT guess; must return None so the
        # frontend falls back to the normal dashboard instead of possibly
        # routing an EMT into a colleague's response for a different
        # patient.
        Incident.objects.create(
            patient=self.patient, status=IncidentStatus.DISPATCHED, ambulance_service=self.ambulance,
        )
        second_patient = make_verified_patient(email="second@test.com")
        Incident.objects.create(
            patient=second_patient, status=IncidentStatus.ON_THE_WAY, ambulance_service=self.ambulance,
        )
        self.client.force_authenticate(user=self.ambulance)
        response = self.client.get("/api/incidents/my_active/")
        self.assertIsNone(response.data["active_incident"])

    def test_emt_resolves_through_effective_ambulance_service(self):
        emt = User.objects.create_user(
            email="emt_active@test.com", password="pass", role=Role.EMT,
            full_name="Active EMT", ambulance_service=self.ambulance,
        )
        incident = Incident.objects.create(
            patient=self.patient, status=IncidentStatus.ARRIVED_ON_SCENE, ambulance_service=self.ambulance,
        )
        self.client.force_authenticate(user=emt)
        response = self.client.get("/api/incidents/my_active/")
        self.assertEqual(response.data["active_incident"]["id"], str(incident.id))

    def test_emt_with_no_linked_ambulance_service_gets_none_not_crash(self):
        orphan_emt = User.objects.create_user(
            email="orphan_active@test.com", password="pass", role=Role.EMT, full_name="Orphan EMT",
        )
        self.client.force_authenticate(user=orphan_emt)
        response = self.client.get("/api/incidents/my_active/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["active_incident"])

    def test_unrelated_ambulance_service_not_shown_someone_elses_incident(self):
        Incident.objects.create(
            patient=self.patient, status=IncidentStatus.DISPATCHED, ambulance_service=self.ambulance,
        )
        other_ambulance = make_ambulance(email="other_amb_active@test.com")
        self.client.force_authenticate(user=other_ambulance)
        response = self.client.get("/api/incidents/my_active/")
        self.assertIsNone(response.data["active_incident"])
