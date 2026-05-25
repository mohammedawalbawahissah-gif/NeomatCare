"""
apps/cases/views.py
--------------------
Endpoints:
  GET  /api/cases/                      — list cases (scoped by role)
  POST /api/cases/                      — create a new case (health worker only)
  GET  /api/cases/{id}/                 — full case detail
  PATCH /api/cases/{id}/               — update an existing case (health worker only)
  POST /api/cases/{id}/triage-note/    — append a clinical note
  GET  /api/cases/{id}/suggest-facilities/ — AI facility recommendations for referral
"""
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsHealthWorker, IsHealthWorkerOrFacilityAdmin
from .models import EmergencyCase, TriageNote
from .serializers import (
    EmergencyCaseCreateSerializer,
    EmergencyCaseUpdateSerializer,
    EmergencyCaseListSerializer,
    EmergencyCaseDetailSerializer,
    TriageNoteSerializer,
)


class EmergencyCaseListCreateView(APIView):
    """
    GET  /api/cases/  — list cases, scoped by the user's role:
        worker     → only cases they created
        admin      → all cases from their facility
        superadmin → all cases across all facilities

    POST /api/cases/  — create a new case (health workers only)
        Creates a Patient record and an EmergencyCase in one request.
    """
    permission_classes = [IsAuthenticated, IsHealthWorkerOrFacilityAdmin]

    def get(self, request):
        user = request.user

        if user.role == 'superadmin':
            cases = EmergencyCase.objects.select_related(
                "patient", "created_by", "referring_facility"
            ).all()

        elif user.role == 'facility_admin':
            cases = EmergencyCase.objects.select_related(
                "patient", "created_by", "referring_facility"
            ).filter(referring_facility=user.facility)

        else:
            # health worker — own cases only
            cases = EmergencyCase.objects.select_related(
                "patient", "created_by", "referring_facility"
            ).filter(created_by=user)

        cases = cases.order_by('-created_at')
        serializer = EmergencyCaseListSerializer(cases, many=True)
        return Response(serializer.data)

    def post(self, request):
        # Only health workers can create cases
        if request.user.role not in ('health_worker', 'superadmin'):
            return Response(
                {"detail": "Only health workers can create emergency cases."},
                status=status.HTTP_403_FORBIDDEN,
            )
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
    GET   /api/cases/{id}/ — full case detail
    PATCH /api/cases/{id}/ — update case fields (health worker who created it, or superadmin)
    """
    permission_classes = [IsAuthenticated, IsHealthWorkerOrFacilityAdmin]

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
        if user.role == 'facility_admin' and case.referring_facility_id == user.facility_id:
            return case, None
        if case.created_by_id == user.id:
            return case, None

        return None, Response(
            {"detail": "You do not have permission to access this case."},
            status=status.HTTP_403_FORBIDDEN,
        )

    def get(self, request, id):
        case, error = self._get_case(id, request.user)
        if error:
            return error
        return Response(EmergencyCaseDetailSerializer(case).data)

    def patch(self, request, id):
        case, error = self._get_case(id, request.user)
        if error:
            return error

        # Only the creating worker or a superadmin can edit
        user = request.user
        if user.role not in ('health_worker', 'superadmin') and case.created_by_id != user.id:
            return Response(
                {"detail": "Only the health worker who created this case can edit it."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = EmergencyCaseUpdateSerializer(
            case,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        if serializer.is_valid():
            case = serializer.save()
            return Response(EmergencyCaseDetailSerializer(case).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class TriageNoteCreateView(APIView):
    """
    POST /api/cases/{id}/triage-note/

    Appends an incremental clinical note to the case.
    Any user with access to the case can add a note.
    Notes are never edited or deleted after creation.

    Body: { "note": "Patient BP rising, 160/110. Monitoring closely." }
    """
    permission_classes = [IsAuthenticated, IsHealthWorkerOrFacilityAdmin]

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
            or (user.role == 'facility_admin' and case.referring_facility_id == user.facility_id)
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
            # Re-fetch with prefetch so triage_notes are included in the response
            case = EmergencyCase.objects.select_related(
                "patient", "created_by", "referring_facility"
            ).prefetch_related("triage_notes__created_by").get(id=id)
            return Response(
                EmergencyCaseDetailSerializer(case).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class SuggestFacilitiesView(APIView):
    """
    GET /api/cases/{id}/suggest-facilities/

    Runs the referral engine against the case's danger signs, gestational age,
    and referring facility location, and returns a ranked list of receiving
    facilities with scores, distances, and capability gap warnings.
    """
    permission_classes = [IsAuthenticated, IsHealthWorkerOrFacilityAdmin]

    def get(self, request, id):
        try:
            case = EmergencyCase.objects.select_related(
                "patient", "referring_facility"
            ).get(id=id)
        except EmergencyCase.DoesNotExist:
            return Response(
                {"detail": "Case not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        user = request.user
        can_access = (
            user.role == 'superadmin'
            or (user.role == 'facility_admin' and case.referring_facility_id == user.facility_id)
            or (case.created_by_id == user.id)
        )
        if not can_access:
            return Response(
                {"detail": "You do not have permission to access this case."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            from apps.referrals.engine import get_facility_recommendations
            result = get_facility_recommendations(case)
            return Response(result)
        except Exception as e:
            return Response(
                {"detail": "Recommendation engine error.", "error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
