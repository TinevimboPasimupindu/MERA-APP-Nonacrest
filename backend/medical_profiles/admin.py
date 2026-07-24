from django.contrib import admin
from .models import MedicalProfile


@admin.register(MedicalProfile)
class MedicalProfileAdmin(admin.ModelAdmin):
    list_display = [
        "patient", "blood_type", "verification_status",
        "data_sharing_consent", "verified_by", "updated_at",
    ]
    list_filter = ["verification_status", "blood_type", "data_sharing_consent"]
    search_fields = ["patient__email", "patient__full_name"]
    readonly_fields = [
        "id", "verified_at", "verified_by", "last_updated_by",
        "last_updated_at", "consent_given_at", "consent_withdrawn_at",
        "created_at", "updated_at",
    ]
    ordering = ["-updated_at"]
