from django.contrib import admin
from .models import VerificationRequest


@admin.register(VerificationRequest)
class VerificationRequestAdmin(admin.ModelAdmin):
    list_display = [
        "patient", "hospital", "status", "urgency_badge",
        "submitted_at", "reviewed_at", "reviewed_by",
    ]
    list_filter = ["status"]
    search_fields = ["patient__email", "hospital__facility_name"]
    readonly_fields = ["id", "submitted_at", "reviewed_at", "reviewed_by", "created_at", "updated_at"]
    ordering = ["submitted_at"]
