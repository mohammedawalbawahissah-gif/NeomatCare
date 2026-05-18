"""
apps/accounts/serializers.py
----------------------------
Serializers for auth and user management endpoints.

RegisterSerializer     — validates and creates a new user
UserSerializer         — read-only profile representation
CustomTokenSerializer  — extends JWT payload with user context
"""
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User


class RegisterSerializer(serializers.ModelSerializer):
    """
    Handles new user registration.
    Validates password strength via Django's built-in validators.
    """
    password  = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, label="Confirm password")
    # facility is optional at registration — superadmins won't have one
    facility  = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model  = User
        fields = ["name", "email", "password", "password2", "role", "facility"]
        extra_kwargs = {
            "role": {"required": False},
        }

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("password2"):
            raise serializers.ValidationError({"password": "Passwords do not match."})
        return attrs

    def create(self, validated_data):
        facility_id = validated_data.pop("facility", None)
        user = User.objects.create_user(**validated_data)
        if facility_id:
            # Defer import to avoid circular reference with facilities app
            from apps.facilities.models import HealthFacility
            try:
                user.facility = HealthFacility.objects.get(id=facility_id)
                user.save(update_fields=["facility"])
            except HealthFacility.DoesNotExist:
                pass  # silently skip — facility validation happens at the view level
        return user


class UserSerializer(serializers.ModelSerializer):
    """
    Read-only serializer for returning user profile data.
    Never exposes password or permission flags.
    """
    facility_name = serializers.CharField(source="facility.name", read_only=True, allow_null=True)
    facility_id   = serializers.UUIDField(source="facility.id", read_only=True, allow_null=True)

    class Meta:
        model  = User
        fields = [
            "id", "name", "email", "role",
            "facility_id", "facility_name",
            "is_active", "created_at",
        ]
        read_only_fields = fields


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Extends the default JWT payload and login response to include
    user role and name. Stored in the token so the frontend can
    render the right UI without an extra /me/ call.
    """

    @classmethod
    def get_token(cls, user: User):
        token = super().get_token(user)
        # Extra claims embedded in the JWT
        token["name"] = user.name
        token["role"] = user.role
        token["facility_id"] = str(user.facility_id) if user.facility_id else None
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        # Include user profile in the login response body alongside the tokens
        data["user"] = UserSerializer(self.user).data
        return data
