"""
apps/referrals/views.py
"""
import logging

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
    _parse_requirements,
    _implicit_services,
)


logger = logging.getLogger(__name__)


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
        phone=f.phone or "",
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
        # "rule_based" (default) or "ai" — see apps.ai.service.facility_recommendation.
        # Any other value is treated as rule_based rather than erroring, since an
        # unrecognised mode from an older client build shouldn't break referral creation.
        mode = request.data.get("mode", "rule_based")

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

        # The rule-based engine always runs first, regardless of mode — it's
        # the candidate pool + grounding data for AI mode, and the automatic
        # fallback if AI mode fails or is unavailable. This also means
        # switching modes on the frontend never has to re-derive candidates
        # from scratch.
        engine = ReferralEngine()
        result = engine.suggest(case_snap, facility_snaps)
        rule_based_payload = self._build_response(result, engine_mode="rule_based", case_id=str(case.id))

        if mode != "ai":
            return Response(rule_based_payload)

        try:
            ai_payload = self._run_ai_mode(case, case_snap, facility_snaps, result)
            return Response(ai_payload)
        except Exception as exc:
            # Covers apps.ai.service.AIServiceError as well as any other
            # unexpected failure (network, malformed candidate data, etc.)
            # — an AI hiccup must never block referral creation, so we fall
            # straight back to the already-computed rule-based result.
            logger.warning("AI facility recommendation failed, falling back to rule-based: %s", exc)
            fallback = dict(rule_based_payload)
            fallback["engine_mode"] = "ai_fallback_rule_based"
            fallback["fallback_reason"] = str(exc)
            return Response(fallback)

    def _build_response(self, result, engine_mode, case_id=None, ai_rationales=None):
        payload = suggestion_to_dict(result)
        ai_rationales = ai_rationales or {}

        def _to_facility_dict(rec):
            return {
                "id":                        rec["facility_id"],
                "name":                      rec["facility_name"],
                "level":                     rec["facility_level"],
                "level_display":             dict(FacilityLevel.choices).get(rec["facility_level"], ""),
                "phone":                     rec["facility_phone"],
                "score":                     rec["score"],
                "capability_score":          rec["capability_score"],
                "distance_km":               rec["distance_km"],
                "estimated_travel_minutes":  rec["estimated_travel_minutes"],
                "confidence":                rec["confidence"],
                "reason_codes":              rec["reason_codes"],
                "ai_rationale":              ai_rationales.get(rec["facility_id"]),
            }

        recommendations = payload.get("recommendations", [])
        recommended_facility = _to_facility_dict(recommendations[0]) if recommendations else None
        alternatives = [_to_facility_dict(r) for r in recommendations[1:]]

        if not recommended_facility:
            return {
                "success": False,
                "detail": "No suitable referral facility found.",
                "engine_version": payload.get("engine_version"),
                "engine_mode": engine_mode,
                "available_modes": ["rule_based", "ai"],
                "emergency_case_id": case_id,
                "recommended_facility": None,
                "alternatives": [],
            }

        return {
            "success": True,
            "detail": "Referral recommendations generated successfully.",
            "engine_version": payload.get("engine_version"),
            "engine_mode": engine_mode,
            "available_modes": ["rule_based", "ai"],
            "emergency_case_id": case_id,
            "recommended_facility": recommended_facility,
            "alternatives": alternatives,
            "total_ranked_facilities": len(recommendations),
        }

    def _run_ai_mode(self, case, case_snap, facility_snaps, rule_based_result):
        """Builds a grounded candidate list from the already-computed
        rule-based scores, asks apps.ai.service.facility_recommendation to
        rank/explain over it, re-validates every returned id, and re-sorts
        the rule-based recommendation list to match the AI's ranking rather
        than trusting any AI-echoed numbers. Raises on any failure — the
        caller (post()) is responsible for catching and falling back."""
        from apps.ai.service import facility_recommendation

        required, min_level = _parse_requirements(case_snap.danger_signs)
        # Candidate pool for the AI: every facility the rule-based engine
        # actually scored (i.e. within search radius), capped to a sane
        # number so the prompt stays small and fast — the top 8 by
        # rule-based score, which already accounts for distance, capability,
        # and level, is a reasonable pre-filter for "worth the AI's time".
        by_id = {s.facility.id: s for s in rule_based_result.recommendations}
        # rule_based_result.recommendations is already capped to top_n=3 by
        # the engine, so re-run scoring against the full facility list to
        # get a wider candidate pool for the AI specifically.
        wide_engine = ReferralEngine()
        wide_result = wide_engine.suggest(case_snap, facility_snaps, top_n=8)
        candidates = []
        for s in wide_result.recommendations:
            if s.capability_score <= 0.0:
                continue
            services = _implicit_services(s.facility)
            candidates.append({
                "facility_id": s.facility.id,
                "facility_name": s.facility.name,
                "facility_level": s.facility.level,
                "distance_km": s.distance_km,
                "estimated_travel_minutes": s.estimated_travel_minutes,
                "capability_score": s.capability_score,
                "matched_services": sorted(required & services),
                "missing_services": sorted(required - services),
                "icu_beds_available": s.facility.icu_beds_available,
                "nicu_cots_available": s.facility.nicu_cots_available,
                "theatre_available": s.facility.theatre_available,
                "blood_bank": s.facility.blood_bank,
                "on_call_specialist": s.facility.on_call_specialist,
                "rule_based_score": s.score,
            })

        patient_context = {"patient_type": getattr(case.patient, "patient_type", None)}
        ai_result = facility_recommendation(case_snap.danger_signs, patient_context, candidates)

        # Re-order the rule-based (already fully-computed, trustworthy)
        # recommendation objects to follow the AI's ranking, and collect
        # rationale text per facility id. Any facility the AI didn't
        # mention is appended after, in its original rule-based order, so
        # nothing silently disappears from the list.
        ai_order = [r["facility_id"] for r in ai_result["recommendations"]]
        ai_rationales = {r["facility_id"]: r.get("rationale", "") for r in ai_result["recommendations"]}
        wide_by_id = {s.facility.id: s for s in wide_result.recommendations}
        ordered = [wide_by_id[fid] for fid in ai_order if fid in wide_by_id]
        remaining = [s for s in wide_result.recommendations if s.facility.id not in ai_order]
        top = (ordered + remaining)[:3]
        for i, s in enumerate(top):
            s.rank = i + 1

        from referral_engine import EngineResult
        reranked = EngineResult(
            recommendations=top,
            confidence=ai_result.get("overall_confidence", wide_result.confidence),
            required_services=wide_result.required_services,
        )
        return self._build_response(reranked, engine_mode="ai", case_id=str(case.id), ai_rationales=ai_rationales)


class ReferralCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in ('health_worker', 'facility_admin', 'superadmin'):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        serializer = ReferralCreateSerializer(data=request.data, context={"request": request})
        if serializer.is_valid():
            referral = serializer.save()
            was_deduped = getattr(serializer, "deduped", False)
            return Response(
                ReferralDetailSerializer(referral).data,
                status=status.HTTP_200_OK if was_deduped else status.HTTP_201_CREATED,
            )
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
