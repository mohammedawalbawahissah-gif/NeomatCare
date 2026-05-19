"""
apps/transport/serializers.py
"""
from rest_framework import serializers
from .models import Transport, TransportRequest


class TransportSerializer(serializers.ModelSerializer):
    facility_name = serializers.CharField(source="facility.name", read_only=True, allow_null=True)
    driver_name   = serializers.CharField(source="driver.name",   read_only=True, allow_null=True)

    class Meta:
        model  = Transport
        fields = [
            "id", "name", "transport_type", "ownership",
            "facility", "facility_name",
            "provider_name",
            "driver", "driver_name", "driver_phone",
            "status", "latitude", "longitude", "location_updated_at",
            "notes", "is_active", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class TransportRequestSerializer(serializers.ModelSerializer):
    transport_name           = serializers.CharField(source="transport.name",                    read_only=True, allow_null=True)
    transport_type           = serializers.CharField(source="transport.transport_type",           read_only=True, allow_null=True)
    driver_phone             = serializers.CharField(source="transport.driver_phone",             read_only=True, allow_null=True)
    requested_by_name        = serializers.CharField(source="requested_by.name",                 read_only=True, allow_null=True)
    pickup_facility_name     = serializers.CharField(source="pickup_facility.name",              read_only=True, allow_null=True)
    destination_facility_name= serializers.CharField(source="destination_facility.name",         read_only=True, allow_null=True)

    class Meta:
        model  = TransportRequest
        fields = [
            "id", "emergency_case",
            "transport", "transport_name", "transport_type", "driver_phone",
            "requested_by", "requested_by_name",
            "status",
            "pickup_facility", "pickup_facility_name",
            "destination_facility", "destination_facility_name",
            "pickup_notes",
            "requested_at", "accepted_at", "arrived_at", "completed_at",
            "estimated_minutes", "driver_notes",
        ]
        read_only_fields = ["id", "requested_at", "requested_by"]

    def create(self, validated_data):
        validated_data["requested_by"] = self.context["request"].user
        return super().create(validated_data)
