from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cases.models import Patient

from .models import CycleEntry
from .serializers import CycleEntrySerializer, SetEddSerializer
from .services import get_child_nutrition_snapshot, get_pregnancy_snapshot, predict_next_cycle, set_self_reported_edd


class MyPregnancySnapshotView(APIView):
    """GET /api/wellness/pregnancy/me/
    404 with reason='no_patient_record' if the caller has no linked
    Patient at all (a health worker needs to register them first).
    404 with reason='no_edd' if they have a Patient record but no
    expected_delivery_date yet — the frontend uses this to show the
    self-report form instead of a dead end."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        patient = Patient.objects.filter(patient_user=request.user).first()
        if not patient:
            return Response(
                {"detail": "No linked patient record.", "reason": "no_patient_record"},
                status=404,
            )
        snapshot = get_pregnancy_snapshot(patient)
        if not snapshot:
            return Response(
                {"detail": "No expected delivery date on file.", "reason": "no_edd"},
                status=404,
            )
        return Response(snapshot)


class SetExpectedDeliveryView(APIView):
    """POST /api/wellness/pregnancy/set-edd/  body: {"last_period_start": "YYYY-MM-DD"}
    Lets a patient self-report their EDD via LMP when they have a
    linked Patient record but no EDD on file yet. See services.py
    docstring for why this doesn't create a Patient record."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = SetEddSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = set_self_reported_edd(
            request.user, serializer.validated_data["last_period_start"]
        )
        if not result["ok"]:
            status_code = 404 if result["reason"] == "no_patient_record" else 400
            return Response({"detail": result["detail"], "reason": result["reason"]}, status=status_code)
        return Response(result)


class CycleEntryListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/wellness/cycle/ — scoped to the requesting patient."""
    serializer_class = CycleEntrySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return CycleEntry.objects.filter(user=self.request.user)


class CyclePredictionView(APIView):
    """GET /api/wellness/cycle/prediction/"""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(predict_next_cycle(request.user))


class ChildNutritionView(APIView):
    """GET /api/wellness/child-nutrition/<uuid:patient_id>/
    Age-banded feeding guidance + danger signs for a child patient,
    scoped by the child's household food_security_flag.

    Access:
      - health_worker / facility_admin / superadmin: any child record
        (matches the existing GrowthRecord view convention — those roles
        aren't further restricted here).
      - patient: only a child in THEIR OWN household — i.e. a caregiver
        can view guidance for their own children even though the child
        itself has no portal login. Not restricted to only their own
        linked Patient record, since that would make this unreachable
        for the exact caregiver use case it exists for.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, patient_id):
        try:
            patient = Patient.objects.select_related("household").get(
                pk=patient_id, deleted_at__isnull=True
            )
        except Patient.DoesNotExist:
            return Response({"detail": "Patient not found."}, status=404)

        if request.user.role == "patient":
            own_patient = Patient.objects.filter(patient_user=request.user).first()
            same_household = (
                own_patient
                and patient.household_id
                and own_patient.household_id == patient.household_id
            )
            is_self = own_patient and own_patient.id == patient.id
            if not (same_household or is_self):
                return Response({"detail": "Permission denied."}, status=403)

        snapshot = get_child_nutrition_snapshot(patient)
        if not snapshot:
            reason = "not_a_child" if patient.patient_type != "child" else "no_age_on_file"
            return Response(
                {"detail": "No nutrition guidance available for this record.", "reason": reason},
                status=404,
            )
        return Response(snapshot)
