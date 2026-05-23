from rest_framework import viewsets, permissions, filters
from rest_framework.decorators import action
from rest_framework.response import Response
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

    @action(detail=False, methods=["get"], url_path="available")
    def available(self, request):
        qs = self.get_queryset().filter(is_available=True)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path="schedules")
    def schedules(self, request, pk=None):
        # Placeholder — extend when schedules model is added
        return Response([])


class ConsultationViewSet(viewsets.ModelViewSet):
    queryset = Consultation.objects.select_related("specialist", "referral", "requested_by").all()
    serializer_class = ConsultationSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["status", "specialist"]
    ordering = ["-created_at"]

    def perform_create(self, serializer):
        serializer.save(requested_by=self.request.user)

    @action(detail=False, methods=["get"], url_path="queue")
    def queue(self, request):
        qs = self.get_queryset().filter(status="pending")
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

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
