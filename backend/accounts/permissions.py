# Reusable role-based DRF permission classes.
# These are referenced by emergency_contacts, emergencies, and notifications apps.

from rest_framework.permissions import BasePermission

from .models import AMBULANCE_ROLES, HOSPITAL_ROLES, Role


class IsPatient(BasePermission):
    # Allow access only to users with role='patient'.
    message = "This action is restricted to patient accounts."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "role", None) == Role.PATIENT
        )


class IsHospital(BasePermission):
    # Allow access to hospital accounts under either the old ('hospital')
    # or new ('hospital_admin') role name — see accounts/models.py HOSPITAL_ROLES.
    message = "This action is restricted to hospital accounts."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "role", None) in HOSPITAL_ROLES
        )


class IsAmbulanceService(BasePermission):
    # Allow access to ambulance accounts under either the old ('ambulance_service')
    # or new ('ambulance_admin') role name — see accounts/models.py AMBULANCE_ROLES.
    message = "This action is restricted to ambulance service accounts."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "role", None) in AMBULANCE_ROLES
        )


class IsMERAAdmin(BasePermission):
    # Allow access to MERA platform administrators: either role='mera_admin'
    # or is_staff=True (Django-shell-created superusers predate the role value).
    message = "This action is restricted to MERA administrators."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (getattr(request.user, "role", None) == Role.MERA_ADMIN or request.user.is_staff)
        )
