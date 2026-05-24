from rest_framework import serializers
from .models import SpecialistProfile, Consultation, ConsultationMessage
from apps.accounts.models import User


class SpecialistProfileSerializer(serializers.ModelSerializer):
    user_name  = serializers.CharField(source="user.name",  read_only=True)
    user_email = serializers.CharField(source="user.email", read_only=True)
    name       = serializers.CharField(write_only=True, required=False)

    class Meta:
        model  = SpecialistProfile
        fields = [
            "id", "user", "user_name", "user_email", "name",
            "professional_pin", "specialty", "years_experience",
            "qualification", "whatsapp_number", "is_available",
            "facility", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "user", "created_at", "updated_at"]

    def validate(self, attrs):
        name = attrs.pop("name", None)
        if name:
            from apps.accounts.models import User
            user = User.objects.filter(name__iexact=name).first()
            if user:
                attrs["user"] = user
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
