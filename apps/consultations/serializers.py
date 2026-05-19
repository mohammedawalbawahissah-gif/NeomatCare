"""
apps/consultations/serializers.py
"""
from rest_framework import serializers
from .models import SpecialistProfile, OnCallSchedule, Consultation, ConsultationMessage


class OnCallScheduleSerializer(serializers.ModelSerializer):
    weekday_display = serializers.CharField(source="get_weekday_display", read_only=True)

    class Meta:
        model  = OnCallSchedule
        fields = ["id", "weekday", "weekday_display", "start_time", "end_time", "is_active"]
        read_only_fields = ["id"]


class SpecialistProfileSerializer(serializers.ModelSerializer):
    user_name         = serializers.CharField(source="user.name",  read_only=True)
    user_email        = serializers.CharField(source="user.email", read_only=True)
    specialty_display = serializers.CharField(source="get_specialty_display", read_only=True)
    schedules         = OnCallScheduleSerializer(many=True, read_only=True)
    facility_name     = serializers.CharField(source="user.facility.name", read_only=True, allow_null=True)

    class Meta:
        model  = SpecialistProfile
        fields = [
            "id", "user", "user_name", "user_email",
            "specialty", "specialty_display",
            "qualification", "years_experience", "bio",
            "is_available", "facility_name",
            "schedules", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class ConsultationMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source="sender.name", read_only=True, allow_null=True)
    sender_role = serializers.CharField(source="sender.role", read_only=True, allow_null=True)

    class Meta:
        model  = ConsultationMessage
        fields = ["id", "consultation", "sender", "sender_name", "sender_role", "body", "sent_at", "is_system"]
        read_only_fields = ["id", "sent_at", "sender", "is_system"]

    def create(self, validated_data):
        validated_data["sender"] = self.context["request"].user
        return super().create(validated_data)


class ConsultationSerializer(serializers.ModelSerializer):
    requested_by_name  = serializers.CharField(source="requested_by.name",           read_only=True, allow_null=True)
    specialist_name    = serializers.CharField(source="specialist.user.name",         read_only=True, allow_null=True)
    specialist_specialty = serializers.CharField(source="specialist.get_specialty_display", read_only=True, allow_null=True)
    messages           = ConsultationMessageSerializer(many=True, read_only=True)
    duration_minutes   = serializers.IntegerField(read_only=True)
    channel_display    = serializers.CharField(source="get_channel_display", read_only=True)
    status_display     = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model  = Consultation
        fields = [
            "id", "emergency_case",
            "requested_by", "requested_by_name",
            "specialist", "specialist_name", "specialist_specialty",
            "channel", "channel_display",
            "status", "status_display",
            "specialist_notes", "recommendation",
            "requested_at", "accepted_at", "started_at", "ended_at",
            "duration_minutes", "room_id",
            "messages",
        ]
        read_only_fields = ["id", "requested_at", "requested_by", "room_id", "duration_minutes"]

    def create(self, validated_data):
        import uuid
        validated_data["requested_by"] = self.context["request"].user
        validated_data["room_id"]      = str(uuid.uuid4())   # unique room per consultation
        return super().create(validated_data)
