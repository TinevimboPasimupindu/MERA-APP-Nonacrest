# Reusable role-based DRF permission classes.
# These are referenced by emergency_contacts, emergencies, and notifications apps.

from rest_framework.permissions import BasePermission


class IsPatient(BasePermission):
    # Allow access only to users with role='patient'.
    message = "This action is restricted to patient accounts."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "role", None) == "patient"
        )


class IsHospital(BasePermission):
    # Allow access only to users with role='hospital_admin'.
    message = "This action is restricted to hospital accounts."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "role", None) == "hospital_admin"
        )


class IsAmbulanceService(BasePermission):
    # Allow access only to users with role='ambulance_service'.
    message = "This action is restricted to ambulance service accounts."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "role", None) == "ambulance_service"
        )


class IsMERAAdmin(BasePermission):
    # Allow access only to MERA platform administrators (is_staff=True).
    message = "This action is restricted to MERA administrators."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_staff
        )
