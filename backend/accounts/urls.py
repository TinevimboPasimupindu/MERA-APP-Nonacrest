from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    AmbulanceRegisterView,
    AvailabilityToggleView,
    HospitalListView,
    HospitalRegisterView,
    InstitutionalApprovalView,
    InstitutionalDocumentUploadView,
    LoginView,
    MeView,
    PatientRegisterView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
)

urlpatterns = [
    # Registration 
    path("register/patient/",   PatientRegisterView.as_view(),   name="register-patient"),
    path("register/hospital/",  HospitalRegisterView.as_view(),  name="register-hospital"),
    path("register/ambulance/", AmbulanceRegisterView.as_view(), name="register-ambulance"),

    # Registered hospitals list
    path("hospitals/", HospitalListView.as_view(), name="hospital-list"),

    # Institutional document upload (step 3) 
    path("documents/", InstitutionalDocumentUploadView.as_view(), name="institutional-documents"),

    # Login & tokens 
    path("login/",         LoginView.as_view(),      name="login"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),

    # Password reset 
    path("password-reset/",         PasswordResetRequestView.as_view(), name="password-reset-request"),
    path("password-reset/confirm/", PasswordResetConfirmView.as_view(), name="password-reset-confirm"),

    # Authenticated user 
    path("me/",                MeView.as_view(),               name="me"),
    path("me/availability/",   AvailabilityToggleView.as_view(), name="availability-toggle"),

    # MERA Admin: institutional approvals 
    path(
        "admin/institutional/<uuid:user_id>/<str:decision>/",
        InstitutionalApprovalView.as_view(),
        name="institutional-approval",
    ),
]