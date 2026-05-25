from django.contrib import admin
from .models import Vehicle


@admin.register(Vehicle)
class VehicleAdmin(admin.ModelAdmin):
    list_display  = ["registration", "vehicle_type", "make", "model", "status", "driver"]
    list_filter   = ["vehicle_type", "status",]
    search_fields = ["registration", "make", "model"]
