from rest_framework import viewsets, permissions, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django_filters.rest_framework import DjangoFilterBackend
from .models import SpecialistProfile, Consultation, ConsultationMessage, CallSignal
from .serializers import SpecialistProfileSerializer, ConsultationSerializer, ConsultationMessageSerializer, CallSignalSerializer


class SpecialistProfileViewSet(viewsets.ModelViewSet):
    queryset = SpecialistProfile.objects.select_related("user", "facility").all()
    serializer_class = SpecialistProfileSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["specialty", "is_available", "facility"]
    search_fields    = ["user__name", "user__email", "professional_pin"]
    ordering         = ["-created_at"]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        # Facility admin scoped to their facility's specialists
        if user.role == 'facility_admin':
            return qs.filter(facility=user.facility)
        return qs

    def check_write_permission(self, request):
        if request.user.role not in ('superadmin', 'facility_admin'):
            raise PermissionDenied("Only admins can manage specialist profiles.")

    def create(self, request, *args, **kwargs):
        self.check_write_permission(request)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self.check_write_permission(request)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self.check_write_permission(request)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if request.user.role != 'superadmin':
            raise PermissionDenied("Only superadmins can delete specialist profiles.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["get"], url_path="available")
    def available(self, request):
        qs = self.get_queryset().filter(is_available=True)
        return Response(self.get_serializer(qs, many=True).data)

    @action(detail=True, methods=["get"], url_path="schedules")
    def schedules(self, request, pk=None):
        return Response([])


class ConsultationViewSet(viewsets.ModelViewSet):
    queryset = Consultation.objects.select_related("specialist", "referral", "requested_by").all()
    serializer_class = ConsultationSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["status", "specialist"]
    ordering = ["-created_at"]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if user.role == 'superadmin':
            return qs
        if user.role == 'facility_admin':
            # Consultations linked to referrals from their facility
            return qs.filter(referral__referring_facility=user.facility)
        if user.role == 'specialist':
            # Specialists see consultations assigned to them, plus any they requested
            from django.db.models import Q
            return qs.filter(Q(specialist__user=user) | Q(requested_by=user))
        # Health workers see only their own
        return qs.filter(requested_by=user)

    def perform_create(self, serializer):
        serializer.save(requested_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        if request.user.role != 'superadmin':
            raise PermissionDenied("Only superadmins can delete consultations.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["get"], url_path="queue")
    def queue(self, request):
        qs = self.get_queryset().filter(status="pending")
        return Response(self.get_serializer(qs, many=True).data)

    @action(detail=True, methods=["patch"], url_path="status")
    def update_status(self, request, pk=None):
        obj = self.get_object()
        serializer = self.get_serializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(detail=True, methods=["get", "post"], url_path="messages")
    def messages(self, request, pk=None):
        consultation = self.get_object()
        if request.method == "GET":
            msgs = consultation.messages.all()
            return Response(ConsultationMessageSerializer(msgs, many=True).data)
        serializer = ConsultationMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(consultation=consultation, sender=request.user)
        return Response(serializer.data, status=201)

    @action(detail=True, methods=["get", "post"], url_path="call-signals")
    def call_signals(self, request, pk=None):
        """
        Polling-based WebRTC signaling exchange. GET returns everything (or,
        with ?since=<ISO timestamp>, only what's new) so the client only
        applies signals it hasn't seen yet rather than replaying the whole
        history every poll. POST appends one signal — an offer, an answer,
        one ICE candidate, or a hangup notice.
        """
        consultation = self.get_object()
        if request.method == "GET":
            signals = consultation.call_signals.all()
            since = request.query_params.get("since")
            if since:
                signals = signals.filter(created_at__gt=since)
            return Response(CallSignalSerializer(signals, many=True).data)
        serializer = CallSignalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(consultation=consultation, sender=request.user)
        return Response(serializer.data, status=201)

    @action(detail=True, methods=["post"], url_path="call-end")
    def call_end(self, request, pk=None):
        """Clears prior signaling history so a fresh call can start clean next time, after logging a hangup for whoever's still polling."""
        consultation = self.get_object()
        CallSignal.objects.create(consultation=consultation, sender=request.user, kind="hangup", payload={})
        return Response(status=204)
