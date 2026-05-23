from rest_framework import serializers
from apps.accounts.models import User
from .models import SpecialistProfile


class SpecialistProfileSerializer(serializers.ModelSerializer):
    # Read-only fields pulled from the linked user
    user_name   = serializers.CharField(source="user.name",  read_only=True)
    user_email  = serializers.CharField(source="user.email", read_only=True)
    # Accept user by email on write
    user_email_input = serializers.EmailField(write_only=True, required=False)

    class Meta:
        model  = SpecialistProfile
        fields = [
            "id",
            "user",
            "user_name",
            "user_email",
            "user_email_input",
            "professional_pin",
            "specialty",
            "years_experience",
            "qualification",
            "whatsapp_number",
            "is_available",
            "facility",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        email = attrs.pop("user_email_input", None)
        if email:
            try:
                user = User.objects.get(email=email, role="specialist")
            except User.DoesNotExist:
                raise serializers.ValidationError(
                    {"user_email_input": "No specialist user found with that email."}
                )
            attrs["user"] = user
        return attrs
