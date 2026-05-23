from rest_framework import serializers
from .models import Vehicle


class VehicleSerializer(serializers.ModelSerializer):
    driver_name     = serializers.CharField(source="driver.name",  read_only=True)
    facility_name   = serializers.CharField(source="facility.name", read_only=True)

    class Meta:
        model  = Vehicle
        fields = [
            "id",
            "registration",
            "vehicle_type",
            "make",
            "model",
            "year",
            "status",
            "driver",
            "driver_name",
            "facility",
            "facility_name",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
