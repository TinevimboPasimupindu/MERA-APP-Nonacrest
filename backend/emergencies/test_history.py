import json
from datetime import datetime
from zoneinfo import ZoneInfo

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import InstitutionalStatus, Role, User
from .models import EmergencyLog, Incident, IncidentStatus, TreatmentNote

LIST_URL = "/api/incidents/history/"

# Values planted in the patient's medical profile. None may ever appear in a
# history response, for any role.
MEDICAL_MARKERS = ["MARKER-CONDITION", "MARKER-MEDICATION", "MARKER-ALLERGY", "MARKER-PARAMEDIC"]

ADMIN_KEYS = {
    "id", "status", "institution", "responding_emt", "hospital",
    "triggered_at", "confirmed_at", "accepted_at",
    "arrived_at", "completed_at", "cancelled_at",
}


def detail_url(incident):
    return f"/api/incidents/{incident.id}/history_detail/"


def make_user(email, role, **extra):
    return User.objects.create_user(
        email=email, password="pass", role=role,
        institutional_status=InstitutionalStatus.APPROVED, **extra,
    )


class IncidentHistoryTest(TestCase):

    @classmethod
    def setUpTestData(cls):
        cls.patient = make_user("patient@test.com", Role.PATIENT, full_name="Thandi Patient")
        profile = cls.patient.medical_profile
        profile.blood_type = "O+"
        profile.chronic_conditions = "MARKER-CONDITION"
        profile.current_medications = "MARKER-MEDICATION"
        profile.known_allergies = "MARKER-ALLERGY"
        profile.paramedic_notes = "MARKER-PARAMEDIC"
        profile.save()

        # Old and new role names, since both are live (see AMBULANCE_ROLES).
        cls.service_a = make_user("a@test.com", Role.AMBULANCE_ADMIN, service_name="Alpha EMS")
        cls.service_b = make_user("b@test.com", Role.AMBULANCE_SERVICE, service_name="Bravo EMS")
        cls.emt = make_user("emt@test.com", Role.EMT, full_name="Sipho Medic", ambulance_service=cls.service_a)
        cls.hospital_1 = make_user("h1@test.com", Role.HOSPITAL_ADMIN, facility_name="City Hospital")
        cls.hospital_2 = make_user("h2@test.com", Role.HOSPITAL, facility_name="Town Hospital")
        cls.mera_admin = make_user("admin@test.com", Role.MERA_ADMIN)

        now = timezone.now()
        # Accepted by an individual EMT of service A, taken to hospital 1.
        cls.incident_a = Incident.objects.create(
            patient=cls.patient, ambulance_service=cls.service_a, destination_hospital=cls.hospital_1,
            status=IncidentStatus.COMPLETED, accepted_at=now, completed_at=now,
        )
        EmergencyLog.objects.create(incident=cls.incident_a, event_type="ambulance_accepted", actor=cls.emt)
        EmergencyLog.objects.create(incident=cls.incident_a, event_type="completed", actor=cls.emt)
        TreatmentNote.objects.create(
            incident=cls.incident_a, authored_by=cls.emt,
            chief_complaint="Fall", treatment_administered="Splint applied", submitted_at=now,
        )
        # Accepted by service B's own account (no individual EMT), hospital 2.
        cls.incident_b = Incident.objects.create(
            patient=cls.patient, ambulance_service=cls.service_b, destination_hospital=cls.hospital_2,
            status=IncidentStatus.ON_THE_WAY, accepted_at=now,
        )
        EmergencyLog.objects.create(incident=cls.incident_b, event_type="ambulance_accepted", actor=cls.service_b)
        # Still broadcasting: nobody has accepted it.
        cls.incident_open = Incident.objects.create(patient=cls.patient, status=IncidentStatus.ACTIVE)

    def client_for(self, user):
        api = APIClient()
        api.force_authenticate(user)
        return api

    def ids(self, response):
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return {row["id"] for row in response.data["results"]}

    def assert_no_medical_profile(self, response):
        body = json.dumps(response.data, default=str)
        for marker in MEDICAL_MARKERS:
            self.assertNotIn(marker, body)
        for key in ("blood_type", "chronic_conditions", "current_medications",
                    "known_allergies", "medical_summary", "patient_summary"):
            self.assertNotIn(f'"{key}"', body)

    # Scoping

    def test_ambulance_admin_sees_only_own_service(self):
        self.assertEqual(self.ids(self.client_for(self.service_a).get(LIST_URL)), {str(self.incident_a.id)})
        self.assertEqual(self.ids(self.client_for(self.service_b).get(LIST_URL)), {str(self.incident_b.id)})

    def test_hospital_sees_only_incidents_routed_to_it(self):
        self.assertEqual(self.ids(self.client_for(self.hospital_1).get(LIST_URL)), {str(self.incident_a.id)})
        self.assertEqual(self.ids(self.client_for(self.hospital_2).get(LIST_URL)), {str(self.incident_b.id)})

    def test_mera_admin_sees_all(self):
        self.assertEqual(
            self.ids(self.client_for(self.mera_admin).get(LIST_URL)),
            {str(self.incident_a.id), str(self.incident_b.id), str(self.incident_open.id)},
        )

    def test_other_roles_get_empty_list(self):
        for user in (self.emt, self.patient):
            response = self.client_for(user).get(LIST_URL)
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(response.data["count"], 0, user.role)

    def test_unauthenticated_is_rejected(self):
        self.assertEqual(APIClient().get(LIST_URL).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_detail_outside_scope_is_404(self):
        cases = [
            (self.service_b, self.incident_a),
            (self.service_a, self.incident_b),
            (self.hospital_2, self.incident_a),
            (self.hospital_1, self.incident_open),
            (self.emt, self.incident_a),
            (self.patient, self.incident_a),
        ]
        for user, incident in cases:
            response = self.client_for(user).get(detail_url(incident))
            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, (user.email, incident.id))

    def test_detail_inside_scope(self):
        for user in (self.service_a, self.hospital_1, self.mera_admin):
            response = self.client_for(user).get(detail_url(self.incident_a))
            self.assertEqual(response.status_code, status.HTTP_200_OK, user.email)
            self.assertEqual(response.data["id"], str(self.incident_a.id))

    # Fields

    def test_institution_view_fields(self):
        for user in (self.service_a, self.hospital_1):
            data = self.client_for(user).get(detail_url(self.incident_a)).data
            self.assertEqual(data["patient_name"], "Thandi Patient")
            self.assertEqual(data["institution"], "Alpha EMS")
            self.assertEqual(data["hospital"], "City Hospital")
            self.assertEqual(data["responding_emt"]["full_name"], "Sipho Medic")
            self.assertEqual(data["status"], IncidentStatus.COMPLETED)
            self.assertIsNotNone(data["completed_at"])
            self.assertEqual(data["treatment_note"]["treatment_administered"], "Splint applied")

    def test_responding_emt_is_null_when_service_accepted_directly(self):
        data = self.client_for(self.service_b).get(detail_url(self.incident_b)).data
        self.assertIsNone(data["responding_emt"])
        self.assertIsNone(data["treatment_note"])

    def test_mera_admin_serializer_has_exact_operational_keys(self):
        api = self.client_for(self.mera_admin)
        for row in api.get(LIST_URL).data["results"]:
            self.assertEqual(set(row), ADMIN_KEYS)
        detail = api.get(detail_url(self.incident_a)).data
        self.assertEqual(set(detail), ADMIN_KEYS)
        self.assertEqual(detail["responding_emt"]["full_name"], "Sipho Medic")

    def test_mera_admin_response_has_no_notes_or_patient_details(self):
        api = self.client_for(self.mera_admin)
        for response in (api.get(LIST_URL), api.get(detail_url(self.incident_a))):
            body = json.dumps(response.data, default=str)
            for leaked in ("Thandi", "Splint applied", "Fall", "patient", "treatment"):
                self.assertNotIn(leaked, body)

    def test_medical_profile_never_appears_for_any_role(self):
        for user in (self.service_a, self.hospital_1, self.mera_admin):
            api = self.client_for(user)
            self.assert_no_medical_profile(api.get(LIST_URL))
            self.assert_no_medical_profile(api.get(detail_url(self.incident_a)))

    # Filtering, pagination, query count

    def test_status_filter(self):
        api = self.client_for(self.mera_admin)
        self.assertEqual(self.ids(api.get(LIST_URL, {"status": "completed"})), {str(self.incident_a.id)})
        self.assertEqual(api.get(LIST_URL, {"status": "bogus"}).status_code, status.HTTP_400_BAD_REQUEST)

    def test_list_is_paginated(self):
        data = self.client_for(self.mera_admin).get(LIST_URL).data
        self.assertEqual(data["count"], 3)
        self.assertIn("next", data)
        self.assertIn("results", data)

    def test_query_count_does_not_grow_with_incidents(self):
        api = self.client_for(self.service_a)
        search = {"q": "Sipho", "status": "completed", "date_from": "2000-01-01"}
        with CaptureQueriesContext(connection) as before:
            api.get(LIST_URL)
        with CaptureQueriesContext(connection) as before_search:
            api.get(LIST_URL, search)
        for _ in range(5):
            incident = Incident.objects.create(
                patient=self.patient, ambulance_service=self.service_a,
                destination_hospital=self.hospital_1, status=IncidentStatus.COMPLETED,
            )
            EmergencyLog.objects.create(incident=incident, event_type="ambulance_accepted", actor=self.emt)
            TreatmentNote.objects.create(incident=incident, chief_complaint="x", treatment_administered="y")
        with CaptureQueriesContext(connection) as after:
            response = api.get(LIST_URL)
        self.assertEqual(response.data["count"], 6)
        self.assertEqual(len(after), len(before))
        with CaptureQueriesContext(connection) as after_search:
            response = api.get(LIST_URL, search)
        self.assertEqual(response.data["count"], 6)
        self.assertEqual(len(after_search), len(before_search))


SAST = ZoneInfo("Africa/Johannesburg")


class IncidentHistorySearchTest(TestCase):
    # ?q=, ?date_from=, ?date_to= on /incidents/history/. Separate fixtures
    # from IncidentHistoryTest so its exact-count assertions stay untouched.

    @classmethod
    def setUpTestData(cls):
        cls.patient = make_user(
            "zanele@test.com", Role.PATIENT, full_name="Zanele Patient", phone_number="0821234567",
        )
        cls.service_a = make_user("a@test.com", Role.AMBULANCE_ADMIN, service_name="Alpha EMS")
        cls.service_b = make_user("b@test.com", Role.AMBULANCE_ADMIN, service_name="Bravo EMS")
        cls.emt_a = make_user("emt-a@test.com", Role.EMT, full_name="Sipho Medic", ambulance_service=cls.service_a)
        cls.emt_b = make_user("emt-b@test.com", Role.EMT, full_name="Lerato Khumalo", ambulance_service=cls.service_b)
        cls.hospital_1 = make_user("h1@test.com", Role.HOSPITAL_ADMIN, facility_name="City Hospital")
        cls.hospital_2 = make_user("h2@test.com", Role.HOSPITAL_ADMIN, facility_name="Town Hospital")
        cls.mera_admin = make_user("admin@test.com", Role.MERA_ADMIN)

        def incident(service, hospital, state, when, accepted_by):
            inc = Incident.objects.create(
                patient=cls.patient, ambulance_service=service, destination_hospital=hospital,
                status=state, triggered_at=when,
            )
            EmergencyLog.objects.create(incident=inc, event_type="ambulance_accepted", actor=accepted_by)
            return inc

        cls.inc1 = incident(cls.service_a, cls.hospital_1, IncidentStatus.COMPLETED,
                            datetime(2026, 3, 10, 12, 0, tzinfo=SAST), cls.emt_a)
        cls.inc2 = incident(cls.service_b, cls.hospital_2, IncidentStatus.COMPLETED,
                            datetime(2026, 3, 15, 8, 0, tzinfo=SAST), cls.emt_b)
        # 23:30 in Johannesburg is 21:30 UTC on the same day; date filters use
        # the project time zone, so this incident belongs to 20 March.
        cls.inc3 = incident(cls.service_a, cls.hospital_2, IncidentStatus.CANCELLED,
                            datetime(2026, 3, 20, 23, 30, tzinfo=SAST), cls.service_a)

    def search(self, user, **params):
        api = APIClient()
        api.force_authenticate(user)
        return api.get(LIST_URL, params)

    def ids(self, user, **params):
        response = self.search(user, **params)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return {row["id"] for row in response.data["results"]}

    def as_ids(self, *incidents):
        return {str(i.id) for i in incidents}

    # q matches

    def test_q_matches_incident_id_prefix_and_full_id(self):
        short = str(self.inc1.id)[:8].upper()
        self.assertEqual(self.ids(self.mera_admin, q=short), self.as_ids(self.inc1))
        self.assertEqual(self.ids(self.mera_admin, q=str(self.inc1.id)), self.as_ids(self.inc1))

    def test_q_matches_service_name(self):
        self.assertEqual(self.ids(self.mera_admin, q="bravo"), self.as_ids(self.inc2))

    def test_q_matches_responding_emt_name(self):
        self.assertEqual(self.ids(self.mera_admin, q="sipho"), self.as_ids(self.inc1))
        self.assertEqual(self.ids(self.mera_admin, q="KHUMALO"), self.as_ids(self.inc2))

    def test_q_matches_hospital_name(self):
        self.assertEqual(self.ids(self.mera_admin, q="town"), self.as_ids(self.inc2, self.inc3))

    # Scope

    def test_q_never_leaves_ambulance_scope(self):
        self.assertEqual(self.ids(self.service_a, q="Khumalo"), set())
        self.assertEqual(self.ids(self.service_a, q="Bravo"), set())
        self.assertEqual(self.ids(self.service_a, q=str(self.inc2.id)[:8]), set())
        self.assertEqual(self.ids(self.service_a, q="town"), self.as_ids(self.inc3))

    def test_q_never_leaves_hospital_scope(self):
        self.assertEqual(self.ids(self.hospital_1, q="Town"), set())
        self.assertEqual(self.ids(self.hospital_1, q="Lerato"), set())
        self.assertEqual(self.ids(self.hospital_1, q=str(self.inc2.id)[:8]), set())
        self.assertEqual(self.ids(self.hospital_2, q="Alpha"), self.as_ids(self.inc3))

    def test_search_results_are_always_a_subset_of_the_unfiltered_list(self):
        users = [self.service_a, self.service_b, self.hospital_1, self.hospital_2,
                 self.mera_admin, self.emt_a, self.patient]
        queries = ["a", "ems", "hospital", "sipho", "lerato", str(self.inc2.id)[:4]]
        for user in users:
            visible = self.ids(user)
            for q in queries:
                self.assertLessEqual(self.ids(user, q=q), visible, (user.email, q))

    def test_patient_details_are_not_searchable(self):
        for user in (self.mera_admin, self.service_a, self.hospital_1):
            for q in ("Zanele", "zanele@test.com", "0821234567"):
                self.assertEqual(self.ids(user, q=q), set(), (user.email, q))

    def test_mera_admin_keys_unchanged_when_searching(self):
        response = self.search(self.mera_admin, q="ems", date_from="2026-01-01")
        self.assertTrue(response.data["results"])
        for row in response.data["results"]:
            self.assertEqual(set(row), ADMIN_KEYS)

    # Dates

    def test_date_bounds_are_inclusive(self):
        self.assertEqual(self.ids(self.mera_admin, date_from="2026-03-15"), self.as_ids(self.inc2, self.inc3))
        self.assertEqual(self.ids(self.mera_admin, date_to="2026-03-15"), self.as_ids(self.inc1, self.inc2))
        self.assertEqual(
            self.ids(self.mera_admin, date_from="2026-03-20", date_to="2026-03-20"), self.as_ids(self.inc3),
        )

    def test_invalid_dates_are_rejected(self):
        cases = (
            {"date_from": "2026-13-01"},
            {"date_to": "15/03/2026"},
            {"date_from": "yesterday"},
            {"date_from": "2026-03-20", "date_to": "2026-03-10"},
        )
        for params in cases:
            response = self.search(self.mera_admin, **params)
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, params)

    # Combined

    def test_status_q_and_dates_combine(self):
        self.assertEqual(
            self.ids(self.mera_admin, status="completed", q="ems", date_from="2026-03-12"),
            self.as_ids(self.inc2),
        )
        self.assertEqual(
            self.ids(self.service_a, status="cancelled", q="town", date_to="2026-03-31"),
            self.as_ids(self.inc3),
        )
