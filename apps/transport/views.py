from rest_framework import viewsets, permissions, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import Vehicle, TransportRequest, Driver
from .serializers import VehicleSerializer, TransportRequestSerializer, DriverSerializer


# ─────────────────────────────────────────────
# VEHICLE VIEWSET
# ─────────────────────────────────────────────
class VehicleViewSet(viewsets.ModelViewSet):

    queryset = Vehicle.objects.select_related("driver", "driver__user").all()
    serializer_class = VehicleSerializer
    permission_classes = [permissions.IsAuthenticated]

    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter
    ]

    # FIXED: removed facility (does not exist)
    filterset_fields = ["vehicle_type", "status", "driver"]

    search_fields = ["registration", "make", "model"]
    ordering_fields = ["created_at", "year"]
    ordering = ["-created_at"]

    @action(detail=False, methods=["get"], url_path="available")
    def available(self, request):
        qs = self.get_queryset().filter(status="available")
        return Response(self.get_serializer(qs, many=True).data)


# ─────────────────────────────────────────────
# DRIVER ENDPOINT (FOR SUPERADMIN DROPDOWN)
# ─────────────────────────────────────────────
class DriverViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Used to populate dropdown when assigning drivers to vehicles
    """
    queryset = Driver.objects.select_related("user").all()
    serializer_class = DriverSerializer
    permission_classes = [permissions.IsAuthenticated]

    filter_backends = [filters.SearchFilter]
    search_fields = ["user__name", "user__email"]


# ─────────────────────────────────────────────
# TRANSPORT REQUEST VIEWSET
# ─────────────────────────────────────────────
class TransportRequestViewSet(viewsets.ModelViewSet):

    queryset = TransportRequest.objects.select_related(
        "vehicle",
        "vehicle__driver",
        "requested_by",
        "referral"
    ).all()

    serializer_class = TransportRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]

    filterset_fields = ["status", "vehicle"]
    ordering = ["-created_at"]

    def get_queryset(self):
        qs = super().get_queryset()

        if self.request.query_params.get("mine") == "true":
            qs = qs.filter(requested_by=self.request.user)

        return qs

    def perform_create(self, serializer):
        serializer.save(requested_by=self.request.user)

    @action(detail=True, methods=["patch"], url_path="status")
    def update_status(self, request, pk=None):
        obj = self.get_object()
        serializer = self.get_serializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)