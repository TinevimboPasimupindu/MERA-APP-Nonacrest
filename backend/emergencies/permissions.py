from rest_framework.permissions import BasePermission

from .models import Incident, IncidentStatus


class IsAcceptingAmbulance(BasePermission):
    # Only the ambulance service that accepted this specific incident may access the patient's medical profile and full incident detail.
    # Access is revoked once the incident is Completed or Cancelled.

    message = "Access to this incident's medical data is restricted to the accepting ambulance service."

    def has_object_permission(self, request, view, obj: Incident):
        if request.user.role != "ambulance_service":
            return False
        if obj.ambulance_service_id != request.user.id:
            return False
        if not obj.medical_profile_access_granted:
            return False
        return True


class IsIncidentPatient(BasePermission):
    # The requesting user is the patient who owns this incident.

    message = "You can only access your own incidents."

    def has_object_permission(self, request, view, obj: Incident):
        return obj.patient_id == request.user.id


class IsDestinationHospital(BasePermission):
    # The requesting hospital is the designated destination for this incident.

    message = "Access restricted to the designated receiving hospital."

    def has_object_permission(self, request, view, obj: Incident):
        if request.user.role != "hospital":
            return False
        return obj.destination_hospital_id == request.user.id
