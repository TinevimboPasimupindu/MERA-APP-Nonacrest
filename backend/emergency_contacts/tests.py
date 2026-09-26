from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Role, User
from .models import EmergencyContact


def make_patient(email="p@test.com"):
    return User.objects.create_user(email=email, password="pass", role=Role.PATIENT)


class EmergencyContactCRUDTest(TestCase):

    def setUp(self):
        self.user = make_patient()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.list_url = reverse("emergency-contact-list")

    def test_create_contact(self):
        response = self.client.post(self.list_url, {
            "full_name": "Sarah Johnson",
            "relationship": "spouse",
            "phone_number": "+27821234567",
            "priority_order": 1,
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(EmergencyContact.objects.filter(patient=self.user).count(), 1)

    def test_max_five_contacts_enforced(self):
        for i in range(5):
            EmergencyContact.objects.create(
                patient=self.user,
                full_name=f"Contact {i}",
                relationship="friend",
                phone_number=f"+2782000000{i}",
                priority_order=i + 1,
            )
        response = self.client.post(self.list_url, {
            "full_name": "Sixth Contact",
            "relationship": "other",
            "phone_number": "+27829999999",
            "priority_order": 1,
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_update_contact(self):
        contact = EmergencyContact.objects.create(
            patient=self.user, full_name="Old Name",
            relationship="parent", phone_number="+27821111111", priority_order=1,
        )
        url = reverse("emergency-contact-detail", args=[contact.id])
        response = self.client.patch(url, {"full_name": "New Name"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        contact.refresh_from_db()
        self.assertEqual(contact.full_name, "New Name")

    def test_delete_contact(self):
        contact = EmergencyContact.objects.create(
            patient=self.user, full_name="To Delete",
            relationship="sibling", phone_number="+27822222222", priority_order=1,
        )
        url = reverse("emergency-contact-detail", args=[contact.id])
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(EmergencyContact.objects.filter(id=contact.id).exists())

    def test_patient_cannot_see_others_contacts(self):
        other = make_patient("other@test.com")
        EmergencyContact.objects.create(
            patient=other, full_name="Hidden",
            relationship="friend", phone_number="+27823333333", priority_order=1,
        )
        response = self.client.get(self.list_url)
        self.assertEqual(len(response.data["results"]), 0)


class EmergencyContactPhoneValidationTest(TestCase):
    # Stored numbers must be something Twilio can actually text when an SOS
    # fires — see normalize_contact_phone.

    def setUp(self):
        self.user = make_patient("phone-v@test.com")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.url = reverse("emergency-contact-list")

    def _create(self, phone):
        return self.client.post(self.url, {
            "full_name": "Contact", "relationship": "friend",
            "phone_number": phone, "priority_order": 1,
        })

    def test_local_sa_number_with_spaces_normalized(self):
        response = self._create("082 123 4567")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["phone_number"], "+27821234567")

    def test_international_number_accepted(self):
        response = self._create("+44 20 7946 0958")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["phone_number"], "+442079460958")

    def test_malformed_numbers_rejected(self):
        for raw in ["12345", "0921234567", "+27 82 123", "+0123456789", "call me"]:
            with self.subTest(raw=raw):
                response = self._create(raw)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("phone_number", response.data)
