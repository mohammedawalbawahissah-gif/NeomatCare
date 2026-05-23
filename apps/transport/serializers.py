from rest_framework import serializers
from .models import Vehicle, TransportRequest


class VehicleSerializer(serializers.ModelSerializer):
    driver_name   = serializers.CharField(source="driver.name",   read_only=True)
    facility_name = serializers.CharField(source="facility.name", read_only=True)

    class Meta:
        model  = Vehicle
        fields = [
            "id", "registration", "vehicle_type", "make", "model", "year",
            "status", "driver", "driver_name", "facility", "facility_name",
            "notes", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TransportRequestSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.CharField(source="requested_by.name", read_only=True)

    class Meta:
        model  = TransportRequest
        fields = [
            "id", "vehicle", "requested_by", "requested_by_name",
            "referral", "status", "notes", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "requested_by", "created_at", "updated_at"]
