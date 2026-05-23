from rest_framework import serializers
from .models import SpecialistProfile, Consultation, ConsultationMessage
from apps.accounts.models import User


class SpecialistProfileSerializer(serializers.ModelSerializer):
    user_name    = serializers.CharField(source="user.name",  read_only=True)
    user_email   = serializers.CharField(source="user.email", read_only=True)
    user_email_input = serializers.EmailField(write_only=True, required=False)

    class Meta:
        model  = SpecialistProfile
        fields = [
            "id", "user", "user_name", "user_email", "user_email_input",
            "professional_pin", "specialty", "years_experience",
            "qualification", "whatsapp_number", "is_available",
            "facility", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        email = attrs.pop("user_email_input", None)
        if email:
            try:
                attrs["user"] = User.objects.get(email=email, role="specialist")
            except User.DoesNotExist:
                raise serializers.ValidationError({"user_email_input": "No specialist user with that email."})
        return attrs


class ConsultationMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source="sender.name", read_only=True)

    class Meta:
        model  = ConsultationMessage
        fields = ["id", "consultation", "sender", "sender_name", "body", "created_at"]
        read_only_fields = ["id", "sender", "created_at"]


class ConsultationSerializer(serializers.ModelSerializer):
    messages = ConsultationMessageSerializer(many=True, read_only=True)

    class Meta:
        model  = Consultation
        fields = [
            "id", "specialist", "referral", "requested_by",
            "status", "notes", "messages", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "requested_by", "created_at", "updated_at"]
