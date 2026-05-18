"""
apps/facilities/serializers.py
-------------------------------
FacilityListSerializer      — lightweight, used in list views and engine results
FacilityDetailSerializer    — full detail including capacity and location
FacilityCreateUpdateSerializer — for POST and PUT by facility admins/superadmins
CapacityUpdateSerializer    — for PATCH /api/facilities/{id}/capacity/
FacilityCapacityLogSerializer — for GET /api/facilities/{id}/capacity-history/
"""
from rest_framework import serializers
from .models import HealthFacility, FacilityCapacityLog


class FacilityListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for list views and referral engine responses.
    Excludes the full service list and log history to keep payloads small —
    important on slow networks in rural areas.
    """
    level_display = serializers.CharField(source="get_level_display", read_only=True)

    class Meta:
        model  = HealthFacility
        fields = [
            "id", "name", "level", "level_display",
            "district", "region",
            "latitude", "longitude",
            "theatre_available", "blood_bank",
            "icu_beds_available", "nicu_cots_available",
            "on_call_specialist", "is_active",
        ]


class FacilityDetailSerializer(serializers.ModelSerializer):
    """
    Full detail serializer — returned on GET /api/facilities/{id}/
    Includes available_services and contact info.
    """
    level_display = serializers.CharField(source="get_level_display", read_only=True)

    class Meta:
        model  = HealthFacility
        fields = [
            "id", "name", "level", "level_display",
            "district", "region", "phone",
            "latitude", "longitude",
            "available_services",
            "icu_beds_available", "nicu_cots_available",
            "theatre_available", "blood_bank",
            "on_call_specialist",
            "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class FacilityCreateUpdateSerializer(serializers.ModelSerializer):
    """
    Used for POST (create) and PUT/PATCH (full update) by admins.
    Validates that latitude and longitude are within plausible Africa bounds.
    """
    class Meta:
        model  = HealthFacility
        fields = [
            "name", "level", "district", "region", "phone",
            "latitude", "longitude",
            "available_services",
            "icu_beds_available", "nicu_cots_available",
            "theatre_available", "blood_bank",
            "on_call_specialist", "is_active",
        ]

    def validate_latitude(self, value):
        if not (-35.0 <= value <= 37.5):
            raise serializers.ValidationError(
                "Latitude must be within the African continent range (-35 to 37.5)."
            )
        return value

    def validate_longitude(self, value):
        if not (-18.0 <= value <= 52.0):
            raise serializers.ValidationError(
                "Longitude must be within the African continent range (-18 to 52)."
            )
        return value


class CapacityUpdateSerializer(serializers.ModelSerializer):
    """
    Partial update serializer for PATCH /api/facilities/{id}/capacity/

    Only allows updating real-time capacity fields — not name, location,
    or other structural fields. A capacity update always writes a log entry.
    """
    class Meta:
        model  = HealthFacility
        fields = [
            "icu_beds_available",
            "nicu_cots_available",
            "theatre_available",
            "blood_bank",
            "on_call_specialist",
        ]

    def update(self, instance, validated_data):
        # Apply the capacity changes
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()

        # Write an immutable log entry with the new snapshot
        FacilityCapacityLog.objects.create(
            facility=instance,
            changed_by=self.context["request"].user,
            snapshot=instance.capacity_snapshot(),
        )
        return instance


class FacilityCapacityLogSerializer(serializers.ModelSerializer):
    """
    Read-only serializer for GET /api/facilities/{id}/capacity-history/
    """
    changed_by_name = serializers.CharField(source="changed_by.name", read_only=True, allow_null=True)

    class Meta:
        model  = FacilityCapacityLog
        fields = ["id", "changed_by_name", "snapshot", "timestamp"]
