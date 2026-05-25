from rest_framework import serializers
from .models import Vehicle, TransportRequest, Driver


# ─────────────────────────────────────────────
# DRIVER SERIALIZER (for SuperAdmin dropdown/UI)
# ─────────────────────────────────────────────
class DriverSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="user.name", read_only=True)
    email = serializers.CharField(source="user.email", read_only=True)

    class Meta:
        model = Driver
        fields = [
            "id",
            "user",
            "name",
            "email",
            "license_number",
            "is_available",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


# ─────────────────────────────────────────────
# VEHICLE SERIALIZER
# ─────────────────────────────────────────────
class VehicleSerializer(serializers.ModelSerializer):
    driver_name = serializers.CharField(source="driver.user.name", read_only=True)

    class Meta:
        model = Vehicle
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
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


# ─────────────────────────────────────────────
# TRANSPORT REQUEST SERIALIZER
# ─────────────────────────────────────────────
class TransportRequestSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.CharField(
        source="requested_by.name",
        read_only=True
    )

    vehicle_registration = serializers.CharField(
        source="vehicle.registration",
        read_only=True
    )

    class Meta:
        model = TransportRequest
        fields = [
            "id",
            "vehicle",
            "vehicle_registration",
            "requested_by",
            "requested_by_name",
            "referral",
            "status",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "requested_by", "created_at", "updated_at"]