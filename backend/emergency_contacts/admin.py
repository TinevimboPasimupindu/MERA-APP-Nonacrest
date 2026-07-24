from django.contrib import admin
from .models import EmergencyContact


@admin.register(EmergencyContact)
class EmergencyContactAdmin(admin.ModelAdmin):
    list_display = ["full_name", "relationship", "phone_number", "patient", "priority_order"]
    list_filter = ["relationship"]
    search_fields = ["full_name", "phone_number", "patient__email"]
    ordering = ["patient", "priority_order"]
