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

    def _resolve_driver(self, driver_id):
        """
        Accept either a Driver model UUID or a User UUID (role=driver).
        If it's a Driver UUID, return it as-is.
        If it's a User UUID, get_or_create a matching Driver record and return its ID.
        Returns None if driver_id is falsy.
        """
        if not driver_id:
            return None

        # Already a Driver record — use directly
        if Driver.objects.filter(id=driver_id).exists():
            return str(driver_id)

        # Try resolving from User with role=driver
        from django.contrib.auth import get_user_model
        UserModel = get_user_model()
        try:
            user = UserModel.objects.get(id=driver_id, role='driver')
            driver, _ = Driver.objects.get_or_create(
                name=user.name,
                defaults={
                    'phone_number': getattr(user, 'phone_number', '') or '',
                    'license_number': '',
                }
            )
            return str(driver.id)
        except (UserModel.DoesNotExist, Exception):
            return str(driver_id)  # pass through, let serializer raise the error

    def _resolved_data(self, request):
        """Return request.data with driver UUID resolved to a Driver record ID."""
        data = request.data.copy()
        driver_id = data.get('driver')
        if driver_id:
            resolved = self._resolve_driver(driver_id)
            if resolved:
                data['driver'] = resolved
            else:
                data.pop('driver', None)
        return data

    def create(self, request, *args, **kwargs):
        self.check_write_permission(request)
        data = self._resolved_data(request)
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(serializer.data, status=201)

    def update(self, request, *args, **kwargs):
        self.check_write_permission(request)
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        data = self._resolved_data(request)
        serializer = self.get_serializer(instance, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

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
            qs = qs.filter(referral__referring_facility=user.facility)
        elif self.request.query_params.get("mine") == "true" or user.role == 'driver':
            qs = qs.filter(requested_by=user)

        if self.request.query_params.get("mine") == "true":
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
