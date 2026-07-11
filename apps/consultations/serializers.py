from rest_framework import serializers
from .models import SpecialistProfile, Consultation, ConsultationMessage
from apps.accounts.models import User


class SpecialistProfileSerializer(serializers.ModelSerializer):
    # Read-only: resolved from linked user or standalone display_name
    user_name      = serializers.SerializerMethodField()
    user_email     = serializers.SerializerMethodField()
    specialty_display = serializers.CharField(source="get_specialty_display", read_only=True)

    # Write-only: "name" used to look up or set display_name
    name = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model  = SpecialistProfile
        fields = [
            "id", "user", "user_name", "user_email", "name",
            "professional_pin", "specialty", "specialty_display", "years_experience",
            "qualification", "whatsapp_number", "is_available",
            "specialist_phone", "specialist_email", "bio",
            "emergency_contact", "facility", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "user", "created_at", "updated_at"]

    def get_user_name(self, obj):
        return obj.user.name if obj.user else obj.display_name

    def get_user_email(self, obj):
        return obj.user.email if obj.user else obj.specialist_email

    def validate(self, attrs):
        name = attrs.pop("name", None)
        if name:
            # Try to link an existing specialist user account
            user = User.objects.filter(name__iexact=name, role="specialist").first()
            if user:
                attrs["user"] = user
            else:
                # No matching account — store as standalone display name
                attrs["display_name"] = name
        return attrs


class ConsultationMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source="sender.name", read_only=True)

    class Meta:
        model  = ConsultationMessage
        fields = ["id", "consultation", "sender", "sender_name", "body", "created_at"]
        read_only_fields = ["id", "sender", "created_at"]


class ConsultationSerializer(serializers.ModelSerializer):
    messages = ConsultationMessageSerializer(many=True, read_only=True)
    specialist_name    = serializers.SerializerMethodField()
    requested_by_name  = serializers.CharField(source="requested_by.name", read_only=True)

    class Meta:
        model  = Consultation
        fields = [
            "id", "specialist", "specialist_name", "referral",
            "requested_by", "requested_by_name",
            "status", "notes", "messages", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "requested_by", "created_at", "updated_at"]

    def get_specialist_name(self, obj):
        if not obj.specialist:
            return None
        return obj.specialist.user.name if obj.specialist.user else obj.specialist.display_name
