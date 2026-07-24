from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),

    path("api/auth/",  include("accounts.urls")),
    path("api/",       include("medical_profiles.urls")),
    path("api/",       include("verification.urls")),
    path("api/",       include("emergency_contacts.urls")),
    path("api/",       include("emergencies.urls")),
    path("api/",       include("chatbot.urls")),

     # Removed: notifications, facilities
]

