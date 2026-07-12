from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cases.models import Patient

from .models import CycleEntry
from .serializers import CycleEntrySerializer
from .services import get_pregnancy_snapshot, predict_next_cycle


class MyPregnancySnapshotView(APIView):
    """GET /api/wellness/pregnancy/me/
    Returns None-ish 404 if the caller has no linked Patient record or
    no expected_delivery_date set — nothing to compute from."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        patient = Patient.objects.filter(patient_user=request.user).first()
        if not patient:
            return Response({"detail": "No linked patient record."}, status=404)
        snapshot = get_pregnancy_snapshot(patient)
        if not snapshot:
            return Response({"detail": "No expected delivery date on file."}, status=404)
        return Response(snapshot)


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
