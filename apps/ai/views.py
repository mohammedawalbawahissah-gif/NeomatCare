"""
apps/ai/views.py
────────────────
REST API views for all NeoMatCare AI features.

Endpoints:
  POST /api/ai/triage-extract/         — extract danger signs from triage note text
  POST /api/ai/risk-narrate/           — narrate patient risk flags
  POST /api/ai/anc-anomaly/            — detect ANC visit anomalies
  POST /api/ai/referral-handover/      — draft referral handover brief
  POST /api/ai/transport-recommend/    — recommend optimal transport vehicle
  POST /api/ai/chat/                   — role-aware conversational assistant
"""

import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from apps.ai.service import (
    AIServiceError,
    triage_extract,
    risk_narrate,
    anc_anomaly_detect,
    referral_handover,
    transport_recommend,
    chat,
)
from apps.cases.models import EmergencyCase, Patient
from apps.cases.serializers import EmergencyCaseDetailSerializer, PatientDetailSerializer
from apps.referrals.models import Referral

logger = logging.getLogger(__name__)


def _ai_error_response(exc: AIServiceError):
    return Response(
        {"success": False, "error": str(exc)},
        status=status.HTTP_503_SERVICE_UNAVAILABLE,
    )


# ── 1. Triage Extraction ──────────────────────────────────────────────────────

class TriageExtractView(APIView):
    """
    POST /api/ai/triage-extract/
    Body: { "note": "<free text triage note>", "case_id": "<optional uuid>" }
    Returns extracted danger signs, severity, and gaps.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        note = request.data.get("note", "").strip()
        if not note:
            return Response({"error": "note is required."}, status=status.HTTP_400_BAD_REQUEST)

        role = request.user.role
        if role not in ("health_worker", "facility_admin", "superadmin"):
            return Response({"error": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        try:
            result = triage_extract(note)
            return Response({"success": True, "data": result})
        except AIServiceError as exc:
            return _ai_error_response(exc)


# ── 2. Risk Narration ─────────────────────────────────────────────────────────

class RiskNarrateView(APIView):
    """
    POST /api/ai/risk-narrate/
    Body: { "patient_id": "<uuid>" }
    Fetches patient's risk_level and risk_flags, narrates them.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        patient_id = request.data.get("patient_id")
        if not patient_id:
            return Response({"error": "patient_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        role = request.user.role
        if role not in ("health_worker", "facility_admin", "superadmin", "specialist"):
            return Response({"error": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        try:
            patient = Patient.objects.get(id=patient_id, deleted_at__isnull=True)
        except Patient.DoesNotExist:
            return Response({"error": "Patient not found."}, status=status.HTTP_404_NOT_FOUND)

        # Scope check for facility_admin
        if role == "facility_admin" and patient.registered_at_facility_id != request.user.facility_id:
            return Response({"error": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        context = {
            "gravida": patient.gravida,
            "parity": patient.parity,
            "anc_visits": patient.anc_visits,
            "blood_group": patient.blood_group,
        }

        try:
            result = risk_narrate(patient.risk_level, patient.risk_flags, context)
            return Response({"success": True, "data": result, "risk_level": patient.risk_level, "risk_flags": patient.risk_flags})
        except AIServiceError as exc:
            return _ai_error_response(exc)


# ── 3. ANC Anomaly Detection ──────────────────────────────────────────────────

class ANCAnomalyView(APIView):
    """
    POST /api/ai/anc-anomaly/
    Body: { "patient_id": "<uuid>" }
    Fetches all ANC visits and detects anomalies.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        patient_id = request.data.get("patient_id")
        if not patient_id:
            return Response({"error": "patient_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        role = request.user.role
        if role not in ("health_worker", "facility_admin", "superadmin", "specialist"):
            return Response({"error": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        try:
            patient = Patient.objects.prefetch_related("anc_visit_log").get(
                id=patient_id, deleted_at__isnull=True
            )
        except Patient.DoesNotExist:
            return Response({"error": "Patient not found."}, status=status.HTTP_404_NOT_FOUND)

        visits = list(
            patient.anc_visit_log.order_by("visit_date").values(
                "visit_date", "gestational_age_weeks", "weight_kg",
                "bp_systolic", "bp_diastolic", "fetal_heart_rate",
                "fundal_height_cm", "concerns",
            )
        )

        try:
            result = anc_anomaly_detect(visits)
            # If escalation recommended, trigger a risk recompute
            if result.get("recommended_risk_escalation"):
                patient.compute_risk()
            return Response({"success": True, "data": result, "visit_count": len(visits)})
        except AIServiceError as exc:
            return _ai_error_response(exc)


# ── 4. Referral Handover Brief ────────────────────────────────────────────────

class ReferralHandoverView(APIView):
    """
    POST /api/ai/referral-handover/
    Body: { "referral_id": "<uuid>" }  OR  { "case_id": "<uuid>" }
    Drafts a clinical handover brief.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        role = request.user.role
        if role not in ("health_worker", "facility_admin", "superadmin", "specialist"):
            return Response({"error": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        referral_id = request.data.get("referral_id")
        case_id     = request.data.get("case_id")

        if not referral_id and not case_id:
            return Response({"error": "referral_id or case_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            if referral_id:
                referral = Referral.objects.select_related(
                    "emergency_case__patient", "receiving_facility"
                ).get(id=referral_id)
                case    = referral.emergency_case
                patient = case.patient
                ref_data = {
                    "receiving_facility": referral.receiving_facility.name if referral.receiving_facility else None,
                    "status": referral.status,
                    "engine_recommendation": str(referral.engine_recommendation_id) if referral.engine_recommendation_id else None,
                }
            else:
                case    = EmergencyCase.objects.select_related("patient", "referring_facility").get(id=case_id)
                patient = case.patient
                ref_data = {}
        except (EmergencyCase.DoesNotExist, Referral.DoesNotExist):
            return Response({"error": "Record not found."}, status=status.HTTP_404_NOT_FOUND)

        # Scope check
        if role == "facility_admin":
            if case.referring_facility_id != request.user.facility_id:
                return Response({"error": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        case_data = {
            "danger_signs": case.danger_signs,
            "presenting_complaint": case.presenting_complaint,
            "gestational_age_weeks": case.gestational_age_weeks,
            "gravida": case.gravida,
            "parity": case.parity,
            "vital_signs": case.vital_signs,
            "membranes_status": case.membranes_status,
            "fetal_heart_rate": case.fetal_heart_rate,
            "obstetric_history": case.obstetric_history,
        }
        patient_data = {
            "name": patient.patient_name if patient else "Unknown",
            "age": patient.age if patient else None,
            "blood_group": patient.blood_group if patient else None,
            "risk_level": patient.risk_level if patient else None,
            "risk_flags": patient.risk_flags if patient else [],
            "gravida": patient.gravida if patient else None,
            "parity": patient.parity if patient else None,
        }

        try:
            result = referral_handover(case_data, patient_data, ref_data)
            return Response({"success": True, "data": result})
        except AIServiceError as exc:
            return _ai_error_response(exc)


# ── 5. Transport Recommendation ───────────────────────────────────────────────

class TransportRecommendView(APIView):
    """
    POST /api/ai/transport-recommend/
    Body: {
      "case_id": "<uuid>",
      "estimated_travel_minutes": <float>,
      "vehicles": [{ "id": ..., "type": ..., "status": ..., "distance_km": ..., "driver_name": ... }]
    }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        role = request.user.role
        if role not in ("health_worker", "facility_admin", "superadmin", "driver"):
            return Response({"error": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        case_id  = request.data.get("case_id")
        vehicles = request.data.get("vehicles", [])
        estimated_travel_minutes = request.data.get("estimated_travel_minutes", 30)

        if not case_id:
            return Response({"error": "case_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            case = EmergencyCase.objects.get(id=case_id)
        except EmergencyCase.DoesNotExist:
            return Response({"error": "Case not found."}, status=status.HTTP_404_NOT_FOUND)

        # Derive urgency from danger signs
        critical_signs = {"PPH", "RUPTURED_UTERUS", "ECLAMPSIA", "CORD_PROLAPSE"}
        signs = set(case.danger_signs or [])
        if signs & critical_signs:
            urgency = "critical"
        elif signs:
            urgency = "high"
        else:
            urgency = "moderate"

        try:
            result = transport_recommend(urgency, list(signs), estimated_travel_minutes, vehicles)
            return Response({"success": True, "data": result, "urgency_classification": urgency})
        except AIServiceError as exc:
            return _ai_error_response(exc)


# ── 6. Chat Assistant ─────────────────────────────────────────────────────────

class ChatView(APIView):
    """
    POST /api/ai/chat/
    Body: {
      "messages": [{"role": "user"|"assistant", "content": "..."}],
      "context": { "page": "...", ... }   // optional
    }
    Returns: { "reply": "<assistant response>" }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        messages = request.data.get("messages", [])
        context  = request.data.get("context", {})
        role     = request.user.role

        if not messages:
            return Response({"error": "messages is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Add user identity to context
        context["user_name"] = request.user.name
        context["user_role"] = role
        if request.user.facility_id:
            context["facility_id"] = str(request.user.facility_id)

        try:
            reply = chat(messages, role=role, context=context)
            return Response({"success": True, "reply": reply})
        except AIServiceError as exc:
            return _ai_error_response(exc)
