from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    AllUsersListView,
    AmbulanceAdminCreateView,
    AmbulanceRegisterView,
    AvailabilityToggleView,
    DeactivateUserView,
    EMTCreateView,
    EMTUpdateView,
    HospitalAdminCreateView,
    HospitalListView,
    HospitalRegisterView,
    InstitutionalApprovalView,
    InstitutionalDocumentUploadView,
    InstitutionsListView,
    LoginView,
    MeView,
    MyEMTsListView,
    PatientRegisterView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    PlatformStatsView,
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

    # MERA Admin: create Hospital Admin / Ambulance Admin accounts
    path("admin/create/hospital-admin/",  HospitalAdminCreateView.as_view(),  name="admin-create-hospital-admin"),
    path("admin/create/ambulance-admin/", AmbulanceAdminCreateView.as_view(), name="admin-create-ambulance-admin"),

    # Ambulance Admin: create EMT accounts + list/edit/deactivate own crew
    path("admin/create/emt/",      EMTCreateView.as_view(),  name="admin-create-emt"),
    path("admin/my-emts/",         MyEMTsListView.as_view(), name="admin-my-emts"),
    path("admin/emts/<uuid:emt_id>/", EMTUpdateView.as_view(), name="admin-emt-update"),

    # MERA Admin: institutions, platform stats, account management
    path("admin/institutions/",                  InstitutionsListView.as_view(), name="admin-institutions"),
    path("admin/stats/",                         PlatformStatsView.as_view(),    name="admin-stats"),
    path("admin/users/",                         AllUsersListView.as_view(),     name="admin-users"),
    path("admin/users/<uuid:user_id>/deactivate/", DeactivateUserView.as_view(), name="admin-user-deactivate"),
]