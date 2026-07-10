"""
apps/referrals/views.py
"""
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsHealthWorker, IsFacilityAdmin
from apps.facilities.models import HealthFacility, FacilityLevel
from apps.cases.models import EmergencyCase

from .models import Referral, ReferralStatusLog, VALID_TRANSITIONS
from .serializers import (
    ReferralCreateSerializer,
    ReferralListSerializer,
    ReferralDetailSerializer,
    StatusUpdateSerializer,
    OutcomeSerializer,
    ReferralStatusLogSerializer,
)

from referral_engine import (
    ReferralEngine,
    CaseSnapshot,
    FacilitySnapshot,
    suggestion_to_dict,
)


def _build_facility_snapshot(f):
    return FacilitySnapshot(
        id=str(f.id),
        name=f.name,
        level=f.level,
        latitude=f.latitude,
        longitude=f.longitude,
        available_services=f.available_services or [],
        icu_beds_available=f.icu_beds_available,
        nicu_cots_available=f.nicu_cots_available,
        theatre_available=f.theatre_available,
        blood_bank=f.blood_bank,
        on_call_specialist=f.on_call_specialist,
    )


def _can_access_referral(user, referral):
    """Shared access check for referral views."""
    if user.role == 'superadmin':
        return True
    if user.role == 'facility_admin' and user.facility_id in (
        referral.referring_facility_id, referral.receiving_facility_id
    ):
        return True
    if referral.created_by_id == user.id:
        return True
    return False


class ReferralSuggestView(APIView):
    # Allow health_worker, facility_admin, and superadmin
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in ('health_worker', 'facility_admin', 'superadmin'):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        case_id = request.data.get("emergency_case_id")
        if not case_id:
            return Response(
                {"success": False, "detail": "emergency_case_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            case = EmergencyCase.objects.select_related("referring_facility").get(id=case_id)
        except EmergencyCase.DoesNotExist:
            return Response({"success": False, "detail": "Emergency case not found."}, status=status.HTTP_404_NOT_FOUND)

        if not case.referring_facility:
            return Response(
                {"success": False, "detail": "No referring facility assigned to this emergency case."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Facility admin can only suggest for cases at their facility
        user = request.user
        if user.role == 'facility_admin' and case.referring_facility_id != user.facility_id:
            return Response({"detail": "You can only suggest referrals for cases at your facility."}, status=status.HTTP_403_FORBIDDEN)

        case_snap = CaseSnapshot(
            id=str(case.id),
            danger_signs=case.danger_signs or [],
            referring_facility_lat=case.referring_facility.latitude,
            referring_facility_lng=case.referring_facility.longitude,
        )
        facilities = HealthFacility.objects.filter(is_active=True).exclude(id=case.referring_facility_id)
        facility_snaps = [_build_facility_snapshot(f) for f in facilities]

        engine = ReferralEngine()
        result = engine.suggest(case_snap, facility_snaps)
        payload = suggestion_to_dict(result)

        # suggestion_to_dict() returns a flat "recommendations" list (each with
        # facility_id/facility_name/facility_level keys). The frontend expects a
        # single top pick under "recommended_facility" plus the rest under
        # "alternatives", each shaped as {id, name, level, distance_km, ...}.
        def _to_facility_dict(rec):
            return {
                "id":                        rec["facility_id"],
                "name":                      rec["facility_name"],
                "level":                     rec["facility_level"],
                "level_display":             dict(FacilityLevel.choices).get(rec["facility_level"], ""),
                "score":                     rec["score"],
                "capability_score":          rec["capability_score"],
                "distance_km":               rec["distance_km"],
                "estimated_travel_minutes":  rec["estimated_travel_minutes"],
                "confidence":                rec["confidence"],
                "reason_codes":              rec["reason_codes"],
            }

        recommendations = payload.get("recommendations", [])
        recommended_facility = _to_facility_dict(recommendations[0]) if recommendations else None
        alternatives = [_to_facility_dict(r) for r in recommendations[1:]]

        if not recommended_facility:
            return Response({
                "success": False,
                "detail": "No suitable referral facility found.",
                "engine_version": payload.get("engine_version"),
                "recommended_facility": None,
                "alternatives": [],
            })

        return Response({
            "success": True,
            "detail": "Referral recommendations generated successfully.",
            "engine_version": payload.get("engine_version"),
            "emergency_case_id": str(case.id),
            "recommended_facility": recommended_facility,
            "alternatives": alternatives,
            "total_ranked_facilities": len(recommendations),
        })


class ReferralCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in ('health_worker', 'facility_admin', 'superadmin'):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        serializer = ReferralCreateSerializer(data=request.data, context={"request": request})
        if serializer.is_valid():
            referral = serializer.save()
            return Response(ReferralDetailSerializer(referral).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ReferralListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.role == 'superadmin':
            referrals = Referral.objects.select_related(
                "referring_facility", "receiving_facility", "created_by"
            ).all()
        elif user.role == 'facility_admin':
            referrals = (
                Referral.objects.select_related(
                    "referring_facility", "receiving_facility", "created_by"
                ).filter(referring_facility=user.facility)
                | Referral.objects.filter(receiving_facility=user.facility)
            )
        else:
            referrals = Referral.objects.select_related(
                "referring_facility", "receiving_facility", "created_by"
            ).filter(created_by=user)

        return Response(ReferralListSerializer(referrals.order_by("-created_at"), many=True).data)


class ReferralDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_referral(self, referral_id, user):
        try:
            referral = Referral.objects.select_related(
                "referring_facility", "receiving_facility",
                "engine_recommendation", "created_by",
            ).prefetch_related("status_logs__changed_by").get(id=referral_id)
        except Referral.DoesNotExist:
            return None, Response({"detail": "Referral not found."}, status=status.HTTP_404_NOT_FOUND)

        if not _can_access_referral(user, referral):
            return None, Response(
                {"detail": "You do not have permission to view this referral."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return referral, None

    def get(self, request, id):
        referral, error = self._get_referral(id, request.user)
        if error:
            return error
        return Response(ReferralDetailSerializer(referral).data)

    def delete(self, request, id):
        if request.user.role != 'superadmin':
            return Response({"detail": "Only superadmins can delete referrals."}, status=status.HTTP_403_FORBIDDEN)
        referral, error = self._get_referral(id, request.user)
        if error:
            return error
        referral.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class StatusUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, id):
        try:
            referral = Referral.objects.get(id=id)
        except Referral.DoesNotExist:
            return Response({"detail": "Referral not found."}, status=status.HTTP_404_NOT_FOUND)

        if not _can_access_referral(request.user, referral):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        if referral.is_terminal:
            return Response(
                {"detail": f"Referral is already in terminal state: {referral.status}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = StatusUpdateSerializer(data=request.data, context={"referral": referral})
        if serializer.is_valid():
            old_status = referral.status
            new_status = serializer.validated_data["status"]
            referral.status = new_status
            referral.save(update_fields=["status", "updated_at"])
            ReferralStatusLog.objects.create(
                referral=referral,
                from_status=old_status,
                to_status=new_status,
                changed_by=request.user,
                note=serializer.validated_data.get("note", ""),
            )
            return Response(ReferralDetailSerializer(referral).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ReferralTimelineView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        try:
            referral = Referral.objects.get(id=id)
        except Referral.DoesNotExist:
            return Response({"detail": "Referral not found."}, status=status.HTTP_404_NOT_FOUND)

        logs = ReferralStatusLog.objects.filter(referral=referral).select_related("changed_by").order_by("timestamp")
        return Response(ReferralStatusLogSerializer(logs, many=True).data)


class OutcomeView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, id):
        try:
            referral = Referral.objects.get(id=id)
        except Referral.DoesNotExist:
            return Response({"detail": "Referral not found."}, status=status.HTTP_404_NOT_FOUND)

        if not _can_access_referral(request.user, referral):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        serializer = OutcomeSerializer(data=request.data, context={"referral": referral})
        if serializer.is_valid():
            referral.maternal_outcome = serializer.validated_data["maternal_outcome"]
            referral.neonatal_outcome = serializer.validated_data["neonatal_outcome"]
            referral.outcome_notes    = serializer.validated_data.get("outcome_notes", "")
            referral.save(update_fields=["maternal_outcome", "neonatal_outcome", "outcome_notes", "updated_at"])
            return Response(ReferralDetailSerializer(referral).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
