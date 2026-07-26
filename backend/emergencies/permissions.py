from rest_framework.permissions import BasePermission

from accounts.models import AMBULANCE_ROLES, HOSPITAL_ROLES, Role

from .models import Incident, IncidentStatus

# Who may respond to incidents (view alerts, accept, update status, submit
# treatment notes) — this is AMBULANCE_ROLES (the institution account) PLUS
# individual EMTs, since EMTs use these same screens to respond in the field.
# Kept separate from accounts.permissions.IsAmbulanceService, which is also
# used to gate EMT-management endpoints (create/list/edit EMTs, toggle
# service availability) that must stay institution-only — an EMT must not
# manage other EMTs or the service's dispatch availability.
AMBULANCE_RESPONDER_ROLES = AMBULANCE_ROLES | {Role.EMT}


class IsAmbulanceResponder(BasePermission):
    # Allow ambulance_service/ambulance_admin accounts AND individual EMTs
    # to respond to incidents. See AMBULANCE_RESPONDER_ROLES above.
    message = "This action is restricted to ambulance service accounts and their EMTs."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "role", None) in AMBULANCE_RESPONDER_ROLES
        )


class IsAcceptingAmbulance(BasePermission):
    # Only the ambulance service (or one of its EMTs) that accepted this
    # specific incident may access the patient's medical profile and full
    # incident detail. Access is revoked once the incident is Completed or Cancelled.

    message = "Access to this incident's medical data is restricted to the accepting ambulance service."

    def has_object_permission(self, request, view, obj: Incident):
        if request.user.role not in AMBULANCE_RESPONDER_ROLES:
            return False
        # Resolves to the EMT's ambulance_admin, so any EMT on the crew that
        # accepted this incident can view it — not just whichever specific
        # EMT called accept().
        account = request.user.effective_ambulance_service
        if account is None or obj.ambulance_service_id != account.id:
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
        if request.user.role not in HOSPITAL_ROLES:
            return False
        return obj.destination_hospital_id == request.user.id
