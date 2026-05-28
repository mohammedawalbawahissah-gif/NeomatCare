"""
apps/facilities/views.py
------------------------
Endpoints:
  GET    /api/facilities/                     — list with optional distance + capability filters
  POST   /api/facilities/                     — register a new facility (facility_admin, superadmin)
  GET    /api/facilities/{id}/                — full facility detail
  PATCH  /api/facilities/{id}/capacity/       — update real-time resources
  GET    /api/facilities/{id}/capacity-history/ — timestamped capacity audit log
"""
import math
from rest_framework import status, generics
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import (
    IsFacilityAdmin,
    IsSuperAdmin,
    IsFacilityAdminForOwnFacility,
)
from .models import HealthFacility, FacilityCapacityLog
from .serializers import (
    FacilityListSerializer,
    FacilityDetailSerializer,
    FacilityCreateUpdateSerializer,
    CapacityUpdateSerializer,
    FacilityCapacityLogSerializer,
)


# ── Haversine helper (mirrors the engine utility) ─────────────────────────────
def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi       = math.radians(lat2 - lat1)
    dlambda    = math.radians(lng2 - lng1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class FacilityListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/facilities/
    POST /api/facilities/

    ── GET filters (all optional, passed as query params) ──────────────────
    lat, lng, radius_km   — return only facilities within radius of this point,
                            sorted nearest first (default radius: 150 km)
    level                 — exact facility level (1–4)
    has_theatre=true      — only facilities with theatre available
    has_blood_bank=true   — only facilities with blood bank
    has_nicu=true         — only facilities with NICU cots > 0
    has_icu=true          — only facilities with ICU beds > 0
    has_specialist=true   — only facilities with on-call specialist
    is_active             — defaults to true; pass false to include inactive

    ── POST ───────────────────────────────────────────────────────────────
    Requires facility_admin or superadmin role.
    """
    permission_classes = [AllowAny]  # overridden per method in get_permissions()

    def get_serializer_class(self):
        if self.request.method == "POST":
            return FacilityCreateUpdateSerializer
        return FacilityListSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsFacilityAdmin()]
        return [AllowAny()]

    def get_queryset(self):
        params = self.request.query_params
        qs = HealthFacility.objects.all()

        # ── is_active filter (default: only active) ────────────────────
        is_active = params.get("is_active", "true").lower()
        qs = qs.filter(is_active=(is_active != "false"))

        # ── Capability filters ─────────────────────────────────────────
        if params.get("level"):
            qs = qs.filter(level=params["level"])
        if params.get("has_theatre", "").lower() == "true":
            qs = qs.filter(theatre_available=True)
        if params.get("has_blood_bank", "").lower() == "true":
            qs = qs.filter(blood_bank=True)
        if params.get("has_nicu", "").lower() == "true":
            qs = qs.filter(nicu_cots_available__gt=0)
        if params.get("has_icu", "").lower() == "true":
            qs = qs.filter(icu_beds_available__gt=0)
        if params.get("has_specialist", "").lower() == "true":
            qs = qs.filter(on_call_specialist=True)

        return qs

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        params   = request.query_params

        # ── Distance filter + sort ─────────────────────────────────────
        # Applied in Python (not SQL) to avoid PostGIS dependency.
        # Feasible for hundreds of facilities; revisit if registry grows large.
        lat_param = params.get("lat")
        lng_param = params.get("lng")

        if lat_param and lng_param:
            try:
                lat        = float(lat_param)
                lng        = float(lng_param)
                radius_km  = float(params.get("radius_km", 150))
            except ValueError:
                return Response(
                    {"detail": "lat, lng, and radius_km must be valid numbers."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            facilities_with_distance = []
            for facility in queryset:
                dist = _haversine_km(lat, lng, facility.latitude, facility.longitude)
                if dist <= radius_km:
                    facilities_with_distance.append((dist, facility))

            # Sort nearest first
            facilities_with_distance.sort(key=lambda x: x[0])

            # Annotate the serializer output with distance_km
            result = []
            for dist, facility in facilities_with_distance:
                data = FacilityListSerializer(facility, context={"request": request}).data
                data["distance_km"] = round(dist, 2)
                result.append(data)

            return Response(result)

        # No GPS params — return full list
        serializer = self.get_serializer(queryset, many=True, context={"request": request})
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        serializer = FacilityCreateUpdateSerializer(data=request.data)
        if serializer.is_valid():
            facility = serializer.save()
            return Response(
                FacilityDetailSerializer(facility).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class FacilityDetailView(generics.RetrieveUpdateAPIView):
    """
    GET   /api/facilities/{id}/  — full facility detail (any authenticated user)
    PUT   /api/facilities/{id}/  — full update (facility_admin for own, superadmin any)
    """
    queryset = HealthFacility.objects.all()
    lookup_field = "id"

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return FacilityCreateUpdateSerializer
        return FacilityDetailSerializer

    def get_permissions(self):
        if self.request.method in ("PUT", "PATCH"):
            return [IsAuthenticated(), IsFacilityAdminForOwnFacility()]
        return [IsAuthenticated()]


class CapacityUpdateView(APIView):
    """
    PATCH /api/facilities/{id}/capacity/

    Updates real-time resource availability and writes a log entry.
    Accessible by the facility's own facility_admin or any superadmin.
    """
    permission_classes = [IsAuthenticated, IsFacilityAdminForOwnFacility]

    def patch(self, request, id):
        try:
            facility = HealthFacility.objects.get(id=id, is_active=True)
        except HealthFacility.DoesNotExist:
            return Response(
                {"detail": "Facility not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        self.check_object_permissions(request, facility)

        serializer = CapacityUpdateSerializer(
            facility,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        if serializer.is_valid():
            updated = serializer.save()
            return Response(
                {
                    "message": "Capacity updated successfully.",
                    "facility": FacilityDetailSerializer(updated).data,
                },
                status=status.HTTP_200_OK,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CapacityHistoryView(APIView):
    """
    GET /api/facilities/{id}/capacity-history/

    Returns the timestamped audit log of capacity changes for a facility.
    Accessible by facility admins (own facility) and superadmins.
    """
    permission_classes = [IsAuthenticated, IsFacilityAdmin]

    def get(self, request, id):
        try:
            facility = HealthFacility.objects.get(id=id)
        except HealthFacility.DoesNotExist:
            return Response(
                {"detail": "Facility not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Facility admins can only view their own facility's history
        if request.user.role == "facility_admin" and request.user.facility_id != facility.id:
            return Response(
                {"detail": "You do not have permission to view this facility's history."},
                status=status.HTTP_403_FORBIDDEN,
            )

        logs = FacilityCapacityLog.objects.filter(facility=facility).order_by("-timestamp")
        serializer = FacilityCapacityLogSerializer(logs, many=True)
        return Response(serializer.data)
