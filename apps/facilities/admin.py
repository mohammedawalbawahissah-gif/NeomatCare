"""
apps/facilities/admin.py
"""
from django.contrib import admin
from .models import HealthFacility, FacilityCapacityLog


@admin.register(HealthFacility)
class HealthFacilityAdmin(admin.ModelAdmin):
    list_display  = [
        "name", "level", "district", "region",
        "theatre_available", "blood_bank",
        "icu_beds_available", "nicu_cots_available",
        "on_call_specialist", "is_active",
    ]
    list_filter   = ["level", "is_active", "theatre_available", "blood_bank"]
    search_fields = ["name", "district", "region"]
    ordering      = ["name"]
    readonly_fields = ["id", "created_at", "updated_at"]

    fieldsets = (
        ("Identity",  {"fields": ("id", "name", "level", "district", "region", "phone", "is_active")}),
        ("Location",  {"fields": ("latitude", "longitude")}),
        ("Services",  {"fields": ("available_services",)}),
        ("Capacity",  {"fields": (
            "icu_beds_available", "nicu_cots_available",
            "theatre_available", "blood_bank", "on_call_specialist",
        )}),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )


@admin.register(FacilityCapacityLog)
class FacilityCapacityLogAdmin(admin.ModelAdmin):
    list_display  = ["facility", "changed_by", "timestamp"]
    list_filter   = ["facility"]
    readonly_fields = ["id", "facility", "changed_by", "snapshot", "timestamp"]
    ordering      = ["-timestamp"]

    def has_add_permission(self, request):
        return False   # logs are append-only; never create via admin

    def has_change_permission(self, request, obj=None):
        return False   # immutable

    def has_delete_permission(self, request, obj=None):
        return False   # immutable
