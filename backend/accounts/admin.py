from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import InstitutionalDocument, PasswordResetToken, User


class InstitutionalDocumentInline(admin.TabularInline):
    model = InstitutionalDocument
    extra = 0
    readonly_fields = ["document_type", "file", "uploaded_at"]
    can_delete = False


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = [
        "email", "role", "get_display_name",
        "institutional_status", "is_active", "is_locked", "date_joined",
    ]
    list_filter = ["role", "institutional_status", "is_active", "is_locked"]
    search_fields = ["email", "full_name", "facility_name", "service_name"]
    ordering = ["-date_joined"]
    readonly_fields = [
        "id", "date_joined", "locked_at",
        "institutional_status_updated_at",
        "failed_login_attempts",
    ]
    inlines = [InstitutionalDocumentInline]

    fieldsets = (
        ("Account", {"fields": ("id", "email", "password", "role", "is_active", "is_staff", "is_superuser")}),
        ("Login Security", {"fields": ("failed_login_attempts", "is_locked", "locked_at")}),
        ("Institutional", {"fields": (
            "institutional_status", "institutional_status_updated_at", "institutional_rejection_reason",
        )}),
        ("Patient Fields", {"fields": ("full_name", "phone_number")}),
        ("Hospital Fields", {"fields": (
            "facility_name", "facility_type", "facility_registration_number",
            "admin_contact_name", "admin_phone", "official_address", "province",
            "has_emergency_unit", "visiting_hours", "latitude", "longitude",
        )}),
        ("Ambulance Fields", {"fields": (
            "service_name", "service_type", "dispatch_phone", "dispatch_address",
            "operational_areas", "capabilities", "number_of_active_ambulances",
            "preferred_hospitals", "is_available",
        )}),
        ("Dates", {"fields": ("date_joined",)}),
    )

    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "role", "password1", "password2"),
        }),
    )

    # Allow MERA admin to quickly approve/reject institutional accounts
    actions = ["approve_institutions", "reject_institutions"]

    def approve_institutions(self, request, queryset):
        from django.utils import timezone
        queryset.filter(role__in=["hospital", "ambulance_service"]).update(
            institutional_status="approved",
            is_active=True,
            institutional_status_updated_at=timezone.now(),
        )
        self.message_user(request, "Selected accounts approved.")
    approve_institutions.short_description = "Approve selected institutional accounts"

    def reject_institutions(self, request, queryset):
        from django.utils import timezone
        queryset.filter(role__in=["hospital", "ambulance_service"]).update(
            institutional_status="rejected",
            institutional_status_updated_at=timezone.now(),
        )
        self.message_user(request, "Selected accounts rejected.")
    reject_institutions.short_description = "Reject selected institutional accounts"


@admin.register(PasswordResetToken)
class PasswordResetTokenAdmin(admin.ModelAdmin):
    list_display = ["user", "used", "created_at", "expires_at"]
    list_filter = ["used"]
    search_fields = ["user__email"]
    readonly_fields = ["id", "token", "created_at"]
