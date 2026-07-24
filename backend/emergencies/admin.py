from django.contrib import admin
from .models import EmergencyLog, Incident, TreatmentNote


class EmergencyLogInline(admin.TabularInline):
    model = EmergencyLog
    extra = 0
    readonly_fields = ["event_type", "description", "actor", "latitude", "longitude", "logged_at"]
    can_delete = False


class TreatmentNoteInline(admin.StackedInline):
    model = TreatmentNote
    extra = 0
    readonly_fields = ["authored_by", "submitted_at", "created_at"]
    can_delete = False


@admin.register(Incident)
class IncidentAdmin(admin.ModelAdmin):
    list_display = [
        "id", "patient", "status", "priority_level",
        "ambulance_service", "destination_hospital",
        "triggered_at", "was_offline_queued",
    ]
    list_filter = ["status", "priority_level", "activation_method", "was_offline_queued"]
    search_fields = ["patient__email", "ambulance_service__email"]
    readonly_fields = ["id", "triggered_at", "created_at", "updated_at"]
    inlines = [TreatmentNoteInline, EmergencyLogInline]
    ordering = ["-triggered_at"]


@admin.register(TreatmentNote)
class TreatmentNoteAdmin(admin.ModelAdmin):
    list_display = ["incident", "authored_by", "is_draft", "submitted_at"]
    list_filter = ["is_draft"]
    search_fields = ["incident__patient__email", "chief_complaint"]


@admin.register(EmergencyLog)
class EmergencyLogAdmin(admin.ModelAdmin):
    list_display = ["event_type", "incident", "actor", "logged_at"]
    list_filter = ["event_type"]
    search_fields = ["incident__patient__email"]
    readonly_fields = ["id", "logged_at"]
    ordering = ["-logged_at"]
