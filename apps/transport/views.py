from rest_framework import viewsets, permissions, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django_filters.rest_framework import DjangoFilterBackend

from .models import Vehicle, TransportRequest, Driver
from .serializers import VehicleSerializer, TransportRequestSerializer, DriverSerializer


class VehicleViewSet(viewsets.ModelViewSet):
    queryset = Vehicle.objects.select_related("driver").all()
    serializer_class = VehicleSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["vehicle_type", "status", "driver"]
    search_fields = ["registration", "make", "model"]
    ordering_fields = ["created_at", "year"]
    ordering = ["-created_at"]

    def check_write_permission(self, request):
        if request.user.role not in ('superadmin', 'facility_admin'):
            raise PermissionDenied("Only admins can manage vehicles.")

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
            raise PermissionDenied("Only superadmins can delete vehicles.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["get"], url_path="available")
    def available(self, request):
        qs = self.get_queryset().filter(status="available")
        return Response(self.get_serializer(qs, many=True).data)


class DriverViewSet(viewsets.ModelViewSet):
    """
    GET    /api/transport/drivers/        — list all drivers
    POST   /api/transport/drivers/        — create a driver record
    GET    /api/transport/drivers/{id}/   — driver detail
    PATCH  /api/transport/drivers/{id}/   — update driver
    """
    queryset = Driver.objects.all()
    serializer_class = DriverSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "phone_number", "license_number"]

    def create(self, request, *args, **kwargs):
        if request.user.role not in ('superadmin', 'facility_admin'):
            raise PermissionDenied("Only admins can create driver records.")
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if request.user.role not in ('superadmin', 'facility_admin'):
            raise PermissionDenied("Only admins can update driver records.")
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if request.user.role not in ('superadmin', 'facility_admin'):
            raise PermissionDenied("Only admins can update driver records.")
        return super().partial_update(request, *args, **kwargs)


class TransportRequestViewSet(viewsets.ModelViewSet):
    queryset = TransportRequest.objects.select_related(
        "vehicle", "vehicle__driver", "requested_by", "referral"
    ).all()
    serializer_class = TransportRequestSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["status", "vehicle"]
    ordering = ["-created_at"]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()

        if user.role == 'superadmin':
            pass  # sees all

        elif user.role == 'facility_admin':
            # Requests linked to referrals from their facility
            qs = qs.filter(referral__referring_facility=user.facility)

        elif user.role == 'driver':
            # Drivers see requests assigned to their vehicle
            # Vehicle.driver is a FK to Driver model (not User),
            # so match by driver name since Driver has no User FK
            driver_qs = Driver.objects.filter(name=user.name)
            qs = qs.filter(vehicle__driver__in=driver_qs)

        elif self.request.query_params.get("mine") == "true":
            qs = qs.filter(requested_by=user)

        return qs

    def perform_create(self, serializer):
        serializer.save(requested_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        if request.user.role != 'superadmin':
            raise PermissionDenied("Only superadmins can delete transport requests.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["patch"], url_path="status")
    def update_status(self, request, pk=None):
        obj = self.get_object()
        serializer = self.get_serializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
