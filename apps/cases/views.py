"""
apps/cases/views.py
--------------------
Endpoints:
  POST /api/cases/             — create a new case (worker+)
  GET  /api/cases/             — list cases (scoped by role)
  GET  /api/cases/{id}/        — full case detail
  POST /api/cases/{id}/triage-note/ — append a clinical note
"""
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsHealthWorker
from .models import EmergencyCase, TriageNote
from .serializers import (
    EmergencyCaseCreateSerializer,
    EmergencyCaseListSerializer,
    EmergencyCaseDetailSerializer,
    TriageNoteSerializer,
)


class EmergencyCaseListCreateView(APIView):
    """
    GET  /api/cases/  — list cases, scoped by the user's role:
        worker  → only cases they created
        admin   → all cases from their facility
        superadmin → all cases across all facilities

    POST /api/cases/  — create a new case
        Creates a Patient record and an EmergencyCase in one request.
    """
    permission_classes = [IsAuthenticated, IsHealthWorker]

    def get(self, request):
        user = request.user

        if user.role == 'superadmin':
            cases = EmergencyCase.objects.select_related(
                "patient", "created_by", "referring_facility"
            ).all()

        elif user.role == 'admin':
            cases = EmergencyCase.objects.select_related(
                "patient", "created_by", "referring_facility"
            ).filter(referring_facility=user.facility)

        else:
            # worker — own cases only
            cases = EmergencyCase.objects.select_related(
                "patient", "created_by", "referring_facility"
            ).filter(created_by=user)

        serializer = EmergencyCaseListSerializer(cases, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = EmergencyCaseCreateSerializer(
            data=request.data,
            context={"request": request},
        )
        if serializer.is_valid():
            case = serializer.save()
            return Response(
                EmergencyCaseDetailSerializer(case).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class EmergencyCaseDetailView(APIView):
    """
    GET /api/cases/{id}/

    Returns full case detail including patient info and all triage notes.
    Access is scoped the same way as the list view.
    """
    permission_classes = [IsAuthenticated, IsHealthWorker]

    def _get_case(self, case_id, user):
        """Fetch the case and enforce ownership/scope rules."""
        try:
            case = EmergencyCase.objects.select_related(
                "patient", "created_by", "referring_facility"
            ).prefetch_related("triage_notes__created_by").get(id=case_id)
        except EmergencyCase.DoesNotExist:
            return None, Response(
                {"detail": "Case not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if user.role == 'superadmin':
            return case, None
        if user.role == 'admin' and case.referring_facility_id == user.facility_id:
            return case, None
        if case.created_by_id == user.id:
            return case, None

        return None, Response(
            {"detail": "You do not have permission to view this case."},
            status=status.HTTP_403_FORBIDDEN,
        )

    def get(self, request, id):
        case, error = self._get_case(id, request.user)
        if error:
            return error
        return Response(EmergencyCaseDetailSerializer(case).data)


class TriageNoteCreateView(APIView):
    """
    POST /api/cases/{id}/triage-note/

    Appends an incremental clinical note to the case.
    Any worker with access to the case can add a note.
    Notes are never edited or deleted after creation.

    Body: { "note": "Patient BP rising, 160/110. Monitoring closely." }
    """
    permission_classes = [IsAuthenticated, IsHealthWorker]

    def post(self, request, id):
        try:
            case = EmergencyCase.objects.get(id=id)
        except EmergencyCase.DoesNotExist:
            return Response(
                {"detail": "Case not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        user = request.user
        can_access = (
            user.role == 'superadmin'
            or (user.role == 'admin' and case.referring_facility_id == user.facility_id)
            or (case.created_by_id == user.id)
        )
        if not can_access:
            return Response(
                {"detail": "You do not have permission to add notes to this case."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = TriageNoteSerializer(data=request.data)
        if serializer.is_valid():
            TriageNote.objects.create(
                emergency_case=case,
                note=serializer.validated_data["note"],
                created_by=request.user,
            )
            return Response(
                EmergencyCaseDetailSerializer(case).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
