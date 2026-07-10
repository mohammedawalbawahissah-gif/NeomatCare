from rest_framework import viewsets, permissions, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django_filters.rest_framework import DjangoFilterBackend
from .models import SpecialistProfile, Consultation, ConsultationMessage
from .serializers import SpecialistProfileSerializer, ConsultationSerializer, ConsultationMessageSerializer


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
