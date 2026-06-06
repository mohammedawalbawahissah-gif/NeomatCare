"""
apps/accounts/serializers.py
"""
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User

# Roles that must be linked to a facility
FACILITY_REQUIRED_ROLES = {"health_worker", "facility_admin"}

# Roles that cannot self-register
BLOCKED_SELF_REGISTER_ROLES = {"superadmin"}


class RegisterSerializer(serializers.ModelSerializer):
    """
    Self-registration serializer — all roles except superadmin.
    All registrants must supply a phone_number; OTP will be sent via SMS
    with email as fallback.
    """
    password       = serializers.CharField(write_only=True, validators=[validate_password])
    password2      = serializers.CharField(write_only=True, label="Confirm password")
    facility       = serializers.UUIDField(required=False, allow_null=True)
    phone_number   = serializers.CharField(required=False, allow_blank=True, max_length=20)
    license_number = serializers.CharField(required=False, allow_blank=True, max_length=100)

    class Meta:
        model  = User
        fields = [
            "name", "email", "password", "password2",
            "role", "facility", "phone_number", "license_number",
        ]
        extra_kwargs = {"role": {"required": False}}

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("password2"):
            raise serializers.ValidationError({"password": "Passwords do not match."})

        role = attrs.get("role", "health_worker")

        if role in BLOCKED_SELF_REGISTER_ROLES:
            raise serializers.ValidationError(
                {"role": "SuperAdmin accounts cannot be created via self-registration."}
            )

        if role in FACILITY_REQUIRED_ROLES and not attrs.get("facility"):
            raise serializers.ValidationError(
                {"facility": f"A facility is required for the {role.replace('_', ' ')} role."}
            )

        return attrs

    def create(self, validated_data):
        facility_id    = validated_data.pop("facility", None)
        phone_number   = validated_data.pop("phone_number", "")
        license_number = validated_data.pop("license_number", "")

        user = User.objects.create_user(**validated_data)
        user.phone_number = phone_number
        update_fields = ["phone_number"]

        if facility_id:
            from apps.facilities.models import HealthFacility
            try:
                user.facility = HealthFacility.objects.get(id=facility_id)
                update_fields.append("facility")
            except HealthFacility.DoesNotExist:
                pass

        user.save(update_fields=update_fields)

        if user.role == "driver":
            from apps.transport.models import Driver
            Driver.objects.get_or_create(
                name=user.name,
                defaults={
                    "phone_number":   phone_number,
                    "license_number": license_number,
                    "is_active":      True,
                },
            )

        return user


class UserSerializer(serializers.ModelSerializer):
    facility_name = serializers.CharField(source="facility.name", read_only=True, allow_null=True)
    facility_id   = serializers.UUIDField(source="facility.id",   read_only=True, allow_null=True)

    class Meta:
        model  = User
        fields = [
            "id", "name", "email", "role",
            "facility_id", "facility_name",
            "is_active", "is_verified", "phone_number",
            "created_at",
        ]
        read_only_fields = fields


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["name"]        = user.name
        token["role"]        = user.role
        token["facility_id"] = str(user.facility_id) if user.facility_id else None
        return token

    def validate(self, attrs):
        data         = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data


class UserCreateSerializer(serializers.ModelSerializer):
    """
    Used by admins (superadmin / facility_admin) to create users directly.
    These accounts are activated immediately — no OTP step.
    """
    password  = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, label="Confirm password")
    facility  = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model  = User
        fields = ["name", "email", "password", "password2", "role", "facility", "is_active"]
        extra_kwargs = {"role": {"required": False}, "is_active": {"required": False}}

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("password2"):
            raise serializers.ValidationError({"password": "Passwords do not match."})
        return attrs

    def create(self, validated_data):
        facility_id = validated_data.pop("facility", None)
        user        = User.objects.create_user(**validated_data)

        if facility_id:
            from apps.facilities.models import HealthFacility
            try:
                user.facility = HealthFacility.objects.get(id=facility_id)
                user.save(update_fields=["facility"])
            except HealthFacility.DoesNotExist:
                pass

        if user.role == "driver":
            from apps.transport.models import Driver
            Driver.objects.get_or_create(
                name=user.name,
                defaults={"is_active": True},
            )

        return user
