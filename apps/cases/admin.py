"""
apps/cases/admin.py
"""
from django.contrib import admin
from .models import Patient, EmergencyCase, TriageNote


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display    = ["id", "age", "district", "blood_group", "anc_visits", "deleted_at"]
    list_filter     = ["blood_group"]
    readonly_fields = ["id", "created_at"]
    search_fields   = ["district"]

    def get_queryset(self, request):
        # Show all patients including soft-deleted in admin
        return super().get_queryset(request)


@admin.register(EmergencyCase)
class EmergencyCaseAdmin(admin.ModelAdmin):
    list_display  = [
        "id", "patient", "referring_facility",
        "gestational_age_weeks", "membranes_status", "created_by", "created_at",
    ]
    list_filter   = ["membranes_status", "referring_facility"]
    search_fields = ["presenting_complaint"]
    readonly_fields = ["id", "created_at"]

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            "patient", "created_by", "referring_facility"
        )


@admin.register(TriageNote)
class TriageNoteAdmin(admin.ModelAdmin):
    list_display  = ["emergency_case", "created_by", "created_at"]
    readonly_fields = ["id", "emergency_case", "note", "created_by", "created_at"]

    def has_add_permission(self, request):
        return False    # append-only — never create via admin

    def has_change_permission(self, request, obj=None):
        return False    # immutable

    def has_delete_permission(self, request, obj=None):
        return False    # immutable
