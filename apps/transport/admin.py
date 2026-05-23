from django.contrib import admin
from .models import Vehicle


@admin.register(Vehicle)
class VehicleAdmin(admin.ModelAdmin):
    list_display  = ["registration", "vehicle_type", "make", "model", "status", "driver", "facility"]
    list_filter   = ["vehicle_type", "status", "facility"]
    search_fields = ["registration", "make", "model"]
