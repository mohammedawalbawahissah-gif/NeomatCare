from rest_framework import serializers
from .models import Vehicle, TransportRequest, Driver


# ─────────────────────────────────────────────
# DRIVER SERIALIZER
# Driver model fields: id, name, phone_number, license_number, is_active, created_at
# NOTE: Driver has NO 'user' FK — name/phone_number/license_number are direct fields.
# ─────────────────────────────────────────────
class DriverSerializer(serializers.ModelSerializer):
    class Meta:
        model = Driver
        fields = [
            "id",
            "name",
            "phone_number",
            "license_number",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


# ─────────────────────────────────────────────
# VEHICLE SERIALIZER
# driver_name reads from Driver.name directly (not driver.user.name)
# ─────────────────────────────────────────────
class VehicleSerializer(serializers.ModelSerializer):
    driver_name  = serializers.CharField(source="driver.name",         read_only=True)
    driver_phone = serializers.CharField(source="driver.phone_number", read_only=True)

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
            "driver_phone",
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
