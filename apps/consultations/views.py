"""
apps/consultations/views.py
---------------------------
GET  /api/consultations/specialists/              — list all specialist profiles
GET  /api/consultations/specialists/available/    — list specialists currently available
POST /api/consultations/specialists/              — create specialist profile (admin)
GET  /api/consultations/specialists/{id}/schedules/ — list schedules for a specialist
POST /api/consultations/specialists/{id}/schedules/ — add schedule

POST /api/consultations/                          — health worker requests a consultation
GET  /api/consultations/                          — list all consultations
GET  /api/consultations/queue/                    — specialist sees their pending consultations
PATCH /api/consultations/{id}/status/             — specialist accepts/declines/completes
POST /api/consultations/{id}/messages/            — send a chat message
GET  /api/consultations/{id}/messages/            — retrieve chat messages
"""
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from .models import (
    SpecialistProfile, OnCallSchedule,
    Consultation, ConsultationMessage,
    ConsultationStatus,
)
from .serializers import (
    SpecialistProfileSerializer, OnCallScheduleSerializer,
    ConsultationSerializer, ConsultationMessageSerializer,
)


class SpecialistProfileViewSet(ModelViewSet):
    serializer_class   = SpecialistProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return SpecialistProfile.objects.select_related("user", "user__facility").prefetch_related("schedules")

    @action(detail=False, methods=["get"], url_path="available")
    def available(self, request):
        """Return specialists currently marked as available."""
        qs = self.get_queryset().filter(is_available=True, user__is_active=True)
        specialty = request.query_params.get("specialty")
        if specialty:
            qs = qs.filter(specialty=specialty)
        return Response(SpecialistProfileSerializer(qs, many=True).data)

    @action(detail=True, methods=["get", "post"], url_path="schedules")
    def schedules(self, request, pk=None):
        specialist = self.get_object()
        if request.method == "GET":
            schedules = specialist.schedules.filter(is_active=True)
            return Response(OnCallScheduleSerializer(schedules, many=True).data)
        elif request.method == "POST":
            serializer = OnCallScheduleSerializer(data=request.data)
            if serializer.is_valid():
                serializer.save(specialist=specialist)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ConsultationViewSet(ModelViewSet):
    serializer_class   = ConsultationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs   = Consultation.objects.select_related(
            "emergency_case", "requested_by", "specialist__user",
        ).prefetch_related("messages__sender")

        # Specialists only see their own consultations
        if user.role == "specialist":
            try:
                profile = user.specialist_profile
                return qs.filter(specialist=profile)
            except SpecialistProfile.DoesNotExist:
                return qs.none()

        # Health workers see consultations they requested
        if user.role == "health_worker":
            return qs.filter(requested_by=user)

        return qs  # admins see all

    @action(detail=False, methods=["get"], url_path="queue")
    def queue(self, request):
        """Specialist's pending consultation queue."""
        user = request.user
        if user.role != "specialist":
            return Response({"detail": "Only specialists can view the queue."}, status=status.HTTP_403_FORBIDDEN)
        try:
            profile = user.specialist_profile
        except SpecialistProfile.DoesNotExist:
            return Response({"detail": "Specialist profile not found."}, status=status.HTTP_404_NOT_FOUND)

        qs = Consultation.objects.filter(
            specialist=profile,
            status__in=[ConsultationStatus.REQUESTED, ConsultationStatus.ACCEPTED, ConsultationStatus.IN_PROGRESS],
        ).select_related("emergency_case", "requested_by").prefetch_related("messages__sender")
        return Response(ConsultationSerializer(qs, many=True).data)

    @action(detail=True, methods=["patch"], url_path="status")
    def update_status(self, request, pk=None):
        """Specialist or admin updates consultation status."""
        obj        = self.get_object()
        new_status = request.data.get("status")

        if new_status not in ConsultationStatus.values:
            return Response({"detail": "Invalid status."}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.now()
        obj.status = new_status

        if new_status == ConsultationStatus.ACCEPTED and not obj.accepted_at:
            obj.accepted_at = now
        elif new_status == ConsultationStatus.IN_PROGRESS and not obj.started_at:
            obj.started_at = now
        elif new_status == ConsultationStatus.COMPLETED and not obj.ended_at:
            obj.ended_at = now
            # Save specialist notes and recommendation if provided
            if "specialist_notes" in request.data:
                obj.specialist_notes = request.data["specialist_notes"]
            if "recommendation" in request.data:
                obj.recommendation = request.data["recommendation"]

        obj.save()
        return Response(ConsultationSerializer(obj).data)

    @action(detail=True, methods=["get", "post"], url_path="messages")
    def messages(self, request, pk=None):
        """Get or send messages in a consultation's text channel."""
        consultation = self.get_object()

        if request.method == "GET":
            msgs = consultation.messages.select_related("sender").order_by("sent_at")
            return Response(ConsultationMessageSerializer(msgs, many=True).data)

        elif request.method == "POST":
            serializer = ConsultationMessageSerializer(
                data={**request.data, "consultation": consultation.id},
                context={"request": request},
            )
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
