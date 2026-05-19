"""
apps/transport/views.py
-----------------------
GET  /api/transport/                  — list all active transport
GET  /api/transport/available/        — list available transport (optionally near a facility)
POST /api/transport/                  — register a new vehicle (admin)
POST /api/transport/requests/         — health worker requests transport for a case
GET  /api/transport/requests/         — list all requests
GET  /api/transport/requests/mine/    — driver sees their assigned requests
PATCH /api/transport/requests/{id}/status/ — driver or admin updates request status
"""
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet
from rest_framework.views import APIView

from .models import Transport, TransportRequest, TransportStatus, RequestStatus
from .serializers import TransportSerializer, TransportRequestSerializer


class TransportViewSet(ModelViewSet):
    serializer_class   = TransportSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Transport.objects.filter(is_active=True).select_related("facility", "driver")

    @action(detail=False, methods=["get"], url_path="available")
    def available(self, request):
        """Return all available transport, optionally filtered by facility."""
        qs = Transport.objects.filter(
            is_active=True,
            status=TransportStatus.AVAILABLE,
        ).select_related("facility", "driver")

        facility_id = request.query_params.get("facility")
        if facility_id:
            qs = qs.filter(facility_id=facility_id)

        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)


class TransportRequestViewSet(ModelViewSet):
    serializer_class   = TransportRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs   = TransportRequest.objects.select_related(
            "transport", "emergency_case", "requested_by",
            "pickup_facility", "destination_facility",
        )
        # Drivers only see requests assigned to their vehicle
        if user.role == "driver" and hasattr(user, "assigned_transport"):
            transport = user.assigned_transport.first()
            if transport:
                return qs.filter(transport=transport)
            return qs.none()
        return qs

    @action(detail=True, methods=["patch"], url_path="status")
    def update_status(self, request, pk=None):
        """Driver or admin updates the status of a transport request."""
        obj        = self.get_object()
        new_status = request.data.get("status")

        if new_status not in RequestStatus.values:
            return Response({"detail": "Invalid status."}, status=status.HTTP_400_BAD_REQUEST)

        obj.status = new_status

        # Auto-stamp timestamps
        now = timezone.now()
        if new_status == RequestStatus.ACCEPTED  and not obj.accepted_at:
            obj.accepted_at = now
            # Mark transport as dispatched
            if obj.transport:
                obj.transport.status = TransportStatus.DISPATCHED
                obj.transport.save(update_fields=["status"])
        elif new_status == RequestStatus.ARRIVED and not obj.arrived_at:
            obj.arrived_at = now
        elif new_status == RequestStatus.COMPLETED and not obj.completed_at:
            obj.completed_at = now
            # Free the transport back up
            if obj.transport:
                obj.transport.status = TransportStatus.AVAILABLE
                obj.transport.save(update_fields=["status"])

        if "estimated_minutes" in request.data:
            obj.estimated_minutes = request.data["estimated_minutes"]
        if "driver_notes" in request.data:
            obj.driver_notes = request.data["driver_notes"]

        obj.save()
        return Response(TransportRequestSerializer(obj).data)
