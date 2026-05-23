"""
apps/referrals/views.py
------------------------
POST /api/referrals/suggest/          — run engine, return top 3 ranked facilities
POST /api/referrals/create/           — create a referral
GET  /api/referrals/                  — list referrals (role-scoped)
GET  /api/referrals/{id}/             — full referral detail
PATCH /api/referrals/{id}/status/     — transition to next state
GET  /api/referrals/{id}/timeline/    — full timestamped state history
PATCH /api/referrals/{id}/outcome/    — record maternal and neonatal outcome
"""
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsHealthWorker, IsFacilityAdmin
from apps.facilities.models import HealthFacility
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


def _build_facility_snapshot(f: HealthFacility) -> FacilitySnapshot:
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


class ReferralSuggestView(APIView):
    permission_classes = [IsAuthenticated, IsHealthWorker]

    def post(self, request):
        """
        Generate ranked referral facility suggestions
        for an emergency case.
        """

        case_id = request.data.get("emergency_case_id")

        # -------------------------------------------------
        # VALIDATION
        # -------------------------------------------------

        if not case_id:
            return Response(
                {
                    "success": False,
                    "detail": "emergency_case_id is required.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # -------------------------------------------------
        # FETCH EMERGENCY CASE
        # -------------------------------------------------

        try:
            case = EmergencyCase.objects.select_related(
                "referring_facility"
            ).get(id=case_id)

        except EmergencyCase.DoesNotExist:
            return Response(
                {
                    "success": False,
                    "detail": "Emergency case not found.",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        # -------------------------------------------------
        # VALIDATE REFERRING FACILITY
        # -------------------------------------------------

        if not case.referring_facility:
            return Response(
                {
                    "success": False,
                    "detail": (
                        "No referring facility assigned "
                        "to this emergency case."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # -------------------------------------------------
        # BUILD CASE SNAPSHOT
        # -------------------------------------------------

        case_snap = CaseSnapshot(
            id=str(case.id),
            danger_signs=case.danger_signs or [],
            referring_facility_lat=case.referring_facility.latitude,
            referring_facility_lng=case.referring_facility.longitude,
        )

        # -------------------------------------------------
        # FETCH AVAILABLE FACILITIES
        # -------------------------------------------------

        facilities = (
            HealthFacility.objects.filter(is_active=True)
            .exclude(id=case.referring_facility_id)
        )

        # -------------------------------------------------
        # BUILD FACILITY SNAPSHOTS
        # -------------------------------------------------

        facility_snaps = [
            _build_facility_snapshot(f)
            for f in facilities
        ]

        # -------------------------------------------------
        # RUN REFERRAL ENGINE
        # -------------------------------------------------

        engine = ReferralEngine()

        result = engine.suggest(
            case_snap,
            facility_snaps,
        )

        payload = suggestion_to_dict(result)

        recommended_facility = payload.get(
            "recommended_facility"
        )

        alternatives = payload.get(
            "alternatives",
            [],
        )

        # -------------------------------------------------
        # NO MATCH FOUND
        # -------------------------------------------------

        if not recommended_facility:
            return Response(
                {
                    "success": False,
                    "detail": (
                        "No suitable referral facility found."
                    ),
                    "engine_version": payload.get(
                        "engine_version"
                    ),
                    "recommended_facility": None,
                    "alternatives": [],
                },
                status=status.HTTP_200_OK,
            )

        # -------------------------------------------------
        # SUCCESS RESPONSE
        # -------------------------------------------------

        return Response(
            {
                "success": True,
                "detail": (
                    "Referral recommendations generated "
                    "successfully."
                ),

                # ENGINE METADATA
                "engine_version": payload.get(
                    "engine_version"
                ),

                # CASE CONTEXT
                "emergency_case_id": str(case.id),

                # PRIMARY RECOMMENDATION
                "recommended_facility":
                    recommended_facility,

                # FALLBACK OPTIONS
                "alternatives":
                    alternatives,

                # ANALYTICS
                "total_ranked_facilities":
                    1 + len(alternatives),
            },
            status=status.HTTP_200_OK,
        )


class ReferralCreateView(APIView):
    permission_classes = [IsAuthenticated, IsHealthWorker]

    def post(self, request):
        serializer = ReferralCreateSerializer(
            data=request.data,
            context={"request": request},
        )
        if serializer.is_valid():
            referral = serializer.save()
            return Response(
                ReferralDetailSerializer(referral).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ReferralListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.is_superadmin:
            referrals = Referral.objects.select_related(
                "referring_facility", "receiving_facility", "created_by"
            ).all()
        elif user.is_facility_admin:
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
        serializer = ReferralListSerializer(referrals.order_by("-created_at"), many=True)
        return Response(serializer.data)


class ReferralDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_referral(self, referral_id, user):
        try:
            referral = Referral.objects.select_related(
                "referring_facility", "receiving_facility",
                "engine_recommendation", "created_by",
            ).prefetch_related("status_logs__changed_by").get(id=referral_id)
        except Referral.DoesNotExist:
            return None, Response(
                {"detail": "Referral not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if user.is_superadmin:
            return referral, None
        if user.is_facility_admin and user.facility_id in (
            referral.referring_facility_id, referral.receiving_facility_id
        ):
            return referral, None
        if referral.created_by_id == user.id:
            return referral, None
        return None, Response(
            {"detail": "You do not have permission to view this referral."},
            status=status.HTTP_403_FORBIDDEN,
        )

    def get(self, request, id):
        referral, error = self._get_referral(id, request.user)
        if error:
            return error
        return Response(ReferralDetailSerializer(referral).data)


class StatusUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, id):
        try:
            referral = Referral.objects.get(id=id)
        except Referral.DoesNotExist:
            return Response(
                {"detail": "Referral not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if referral.is_terminal:
            return Response(
                {"detail": f"Referral is already in terminal state: {referral.status}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = StatusUpdateSerializer(
            data=request.data,
            context={"referral": referral},
        )
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
            return Response(
                ReferralDetailSerializer(referral).data,
                status=status.HTTP_200_OK,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ReferralTimelineView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        try:
            referral = Referral.objects.get(id=id)
        except Referral.DoesNotExist:
            return Response(
                {"detail": "Referral not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        logs = ReferralStatusLog.objects.filter(
            referral=referral
        ).select_related("changed_by").order_by("timestamp")
        return Response(ReferralStatusLogSerializer(logs, many=True).data)


class OutcomeView(APIView):
    permission_classes = [IsAuthenticated, IsHealthWorker]

    def patch(self, request, id):
        try:
            referral = Referral.objects.get(id=id)
        except Referral.DoesNotExist:
            return Response(
                {"detail": "Referral not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = OutcomeSerializer(
            data=request.data,
            context={"referral": referral},
        )
        if serializer.is_valid():
            referral.maternal_outcome = serializer.validated_data["maternal_outcome"]
            referral.neonatal_outcome = serializer.validated_data["neonatal_outcome"]
            referral.outcome_notes = serializer.validated_data.get("outcome_notes", "")
            referral.save(update_fields=[
                "maternal_outcome", "neonatal_outcome", "outcome_notes", "updated_at"
            ])
            return Response(
                ReferralDetailSerializer(referral).data,
                status=status.HTTP_200_OK,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)