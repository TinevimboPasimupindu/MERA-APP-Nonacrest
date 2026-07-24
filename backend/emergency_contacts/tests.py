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
