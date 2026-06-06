"""
apps/cases/views.py
"""
from django.db.models import Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsHealthWorkerOrFacilityAdmin
from .models import Patient, ANCVisit, PatientConsent, EmergencyCase, TriageNote
from .serializers import (
    PatientListSerializer, PatientDetailSerializer,
    PatientCreateSerializer, PatientUpdateSerializer,
    ANCVisitSerializer, PatientConsentSerializer,
    EmergencyCaseCreateSerializer, EmergencyCaseUpdateSerializer,
    EmergencyCaseListSerializer, EmergencyCaseDetailSerializer,
    TriageNoteSerializer,
)


# ── Patient Views ─────────────────────────────────────────────────────────────

class PatientListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsHealthWorkerOrFacilityAdmin]

    def get(self, request):
        qs = Patient.objects.filter(deleted_at__isnull=True).select_related(
            "registered_at_facility"
        ).prefetch_related("cases")

        user = request.user
        if user.role == "facility_admin":
            qs = qs.filter(registered_at_facility=user.facility)

        q = request.query_params.get("q", "").strip()
        if q:
            qs = qs.filter(
                Q(patient_name__icontains=q) |
                Q(hospital_id__icontains=q) |
                Q(patient_phone_number__icontains=q)
            )

        risk = request.query_params.get("risk_level")
        if risk:
            qs = qs.filter(risk_level=risk)

        return Response(PatientListSerializer(qs.order_by("-created_at"), many=True).data)

    def post(self, request):
        serializer = PatientCreateSerializer(data=request.data, context={"request": request})
        if serializer.is_valid():
            patient = serializer.save()
            return Response(PatientDetailSerializer(patient).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PatientDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_patient(self, pk, user):
        try:
            patient = Patient.objects.select_related("registered_at_facility", "patient_user").prefetch_related(
                "cases__referring_facility", "cases__created_by",
                "anc_visit_log__facility", "anc_visit_log__conducted_by",
                "consents__recorded_by",
            ).get(pk=pk, deleted_at__isnull=True)
        except Patient.DoesNotExist:
            return None, Response({"detail": "Patient not found."}, status=status.HTTP_404_NOT_FOUND)

        # Patient portal users can only see their own profile
        if user.role == "patient":
            if not hasattr(user, "patient_profile") or user.patient_profile.id != patient.id:
                return None, Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        return patient, None

    def get(self, request, pk):
        patient, err = self._get_patient(pk, request.user)
        if err:
            return err
        return Response(PatientDetailSerializer(patient).data)

    def patch(self, request, pk):
        patient, err = self._get_patient(pk, request.user)
        if err:
            return err
        if request.user.role == "patient":
            return Response({"detail": "Patients cannot edit their own record."}, status=status.HTTP_403_FORBIDDEN)
        serializer = PatientUpdateSerializer(patient, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            patient.refresh_from_db()
            return Response(PatientDetailSerializer(patient).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        if request.user.role != "superadmin":
            return Response({"detail": "Only superadmins can delete patients."}, status=status.HTTP_403_FORBIDDEN)
        patient, err = self._get_patient(pk, request.user)
        if err:
            return err
        patient.soft_delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PatientCasesView(APIView):
    """GET /api/patients/{pk}/cases/ — full case timeline for a patient."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            patient = Patient.objects.get(pk=pk, deleted_at__isnull=True)
        except Patient.DoesNotExist:
            return Response({"detail": "Patient not found."}, status=status.HTTP_404_NOT_FOUND)

        if request.user.role == "patient":
            if not hasattr(request.user, "patient_profile") or request.user.patient_profile.id != patient.id:
                return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        cases = EmergencyCase.objects.select_related(
            "referring_facility", "created_by"
        ).prefetch_related("triage_notes__created_by").filter(patient=patient).order_by("-created_at")
        return Response(EmergencyCaseDetailSerializer(cases, many=True).data)


class PatientRiskView(APIView):
    """POST /api/patients/{pk}/compute-risk/ — recompute risk flags."""
    permission_classes = [IsAuthenticated, IsHealthWorkerOrFacilityAdmin]

    def post(self, request, pk):
        try:
            patient = Patient.objects.prefetch_related("cases").get(pk=pk, deleted_at__isnull=True)
        except Patient.DoesNotExist:
            return Response({"detail": "Patient not found."}, status=status.HTTP_404_NOT_FOUND)
        patient.compute_risk()
        return Response({"risk_level": patient.risk_level, "risk_flags": patient.risk_flags})


# ── ANC Visit Views ───────────────────────────────────────────────────────────

class ANCVisitListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsHealthWorkerOrFacilityAdmin]

    def get(self, request, pk):
        try:
            patient = Patient.objects.get(pk=pk, deleted_at__isnull=True)
        except Patient.DoesNotExist:
            return Response({"detail": "Patient not found."}, status=status.HTTP_404_NOT_FOUND)
        visits = ANCVisit.objects.select_related("facility", "conducted_by").filter(patient=patient)
        return Response(ANCVisitSerializer(visits, many=True).data)

    def post(self, request, pk):
        try:
            patient = Patient.objects.get(pk=pk, deleted_at__isnull=True)
        except Patient.DoesNotExist:
            return Response({"detail": "Patient not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = ANCVisitSerializer(data=request.data)
        if serializer.is_valid():
            visit = serializer.save(patient=patient, conducted_by=request.user)
            # Recompute risk after new visit
            patient.refresh_from_db()
            patient.compute_risk()
            return Response(ANCVisitSerializer(visit).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ANCVisitDetailView(APIView):
    permission_classes = [IsAuthenticated, IsHealthWorkerOrFacilityAdmin]

    def patch(self, request, pk, visit_id):
        try:
            visit = ANCVisit.objects.get(pk=visit_id, patient_id=pk)
        except ANCVisit.DoesNotExist:
            return Response({"detail": "ANC visit not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = ANCVisitSerializer(visit, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk, visit_id):
        if request.user.role != "superadmin":
            return Response({"detail": "Only superadmins can delete ANC visits."}, status=status.HTTP_403_FORBIDDEN)
        try:
            visit = ANCVisit.objects.get(pk=visit_id, patient_id=pk)
        except ANCVisit.DoesNotExist:
            return Response({"detail": "ANC visit not found."}, status=status.HTTP_404_NOT_FOUND)
        visit.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Consent Views ─────────────────────────────────────────────────────────────

class PatientConsentView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            patient = Patient.objects.get(pk=pk, deleted_at__isnull=True)
        except Patient.DoesNotExist:
            return Response({"detail": "Patient not found."}, status=status.HTTP_404_NOT_FOUND)
        consents = PatientConsent.objects.filter(patient=patient).select_related("recorded_by")
        return Response(PatientConsentSerializer(consents, many=True).data)

    def post(self, request, pk):
        try:
            patient = Patient.objects.get(pk=pk, deleted_at__isnull=True)
        except Patient.DoesNotExist:
            return Response({"detail": "Patient not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = PatientConsentSerializer(data=request.data)
        if serializer.is_valid():
            consent = PatientConsent.objects.create(
                patient      = patient,
                consent_type = serializer.validated_data["consent_type"],
                action       = serializer.validated_data["action"],
                notes        = serializer.validated_data.get("notes", ""),
                recorded_by  = request.user,
            )
            # Mirror onto Patient.consent_given for quick access
            if serializer.validated_data["action"] == "granted":
                from django.utils import timezone
                patient.consent_given = True
                patient.consent_given_at = timezone.now()
                patient.save(update_fields=["consent_given", "consent_given_at"])
            elif serializer.validated_data["action"] == "revoked":
                patient.consent_given = False
                patient.save(update_fields=["consent_given"])
            return Response(PatientConsentSerializer(consent).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ── Patient Portal ────────────────────────────────────────────────────────────

class PatientPortalGrantView(APIView):
    """
    POST /api/patients/{pk}/grant-portal/
    Creates a User account with role=patient and links it to the Patient record.
    Body: { email, password }
    """
    permission_classes = [IsAuthenticated, IsHealthWorkerOrFacilityAdmin]

    def post(self, request, pk):
        try:
            patient = Patient.objects.get(pk=pk, deleted_at__isnull=True)
        except Patient.DoesNotExist:
            return Response({"detail": "Patient not found."}, status=status.HTTP_404_NOT_FOUND)

        if patient.patient_user_id:
            return Response({"detail": "Patient already has a portal account."}, status=status.HTTP_400_BAD_REQUEST)

        email    = request.data.get("email", "").strip()
        password = request.data.get("password", "").strip()

        if not email or not password:
            return Response({"detail": "email and password are required."}, status=status.HTTP_400_BAD_REQUEST)
        if len(password) < 8:
            return Response({"detail": "Password must be at least 8 characters."}, status=status.HTTP_400_BAD_REQUEST)

        from apps.accounts.models import User
        if User.objects.filter(email=email).exists():
            return Response({"detail": "A user with this email already exists."}, status=status.HTTP_400_BAD_REQUEST)

        portal_user = User.objects.create_user(
            email    = email,
            name     = patient.patient_name or "Patient",
            password = password,
            role     = "patient",
        )
        patient.patient_user = portal_user
        patient.save(update_fields=["patient_user"])

        # Auto-grant portal consent
        PatientConsent.objects.create(
            patient      = patient,
            consent_type = "portal",
            action       = "granted",
            recorded_by  = request.user,
            notes        = "Portal account created by health worker.",
        )
        return Response({"detail": "Portal account created.", "portal_email": email}, status=status.HTTP_201_CREATED)


class PatientPortalRevokeView(APIView):
    """POST /api/patients/{pk}/revoke-portal/ — deactivates the portal user account."""
    permission_classes = [IsAuthenticated, IsHealthWorkerOrFacilityAdmin]

    def post(self, request, pk):
        try:
            patient = Patient.objects.select_related("patient_user").get(pk=pk, deleted_at__isnull=True)
        except Patient.DoesNotExist:
            return Response({"detail": "Patient not found."}, status=status.HTTP_404_NOT_FOUND)

        if not patient.patient_user_id:
            return Response({"detail": "Patient has no portal account."}, status=status.HTTP_400_BAD_REQUEST)

        patient.patient_user.is_active = False
        patient.patient_user.save(update_fields=["is_active"])

        PatientConsent.objects.create(
            patient      = patient,
            consent_type = "portal",
            action       = "revoked",
            recorded_by  = request.user,
            notes        = "Portal access revoked by health worker.",
        )
        return Response({"detail": "Portal access revoked."})


# ── Emergency Case Views (unchanged logic, updated serializer calls) ──────────

class EmergencyCaseListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsHealthWorkerOrFacilityAdmin]

    def get(self, request):
        user = request.user
        qs = EmergencyCase.objects.select_related("patient", "created_by", "referring_facility")
        if user.role == "superadmin":
            pass
        elif user.role == "facility_admin":
            qs = qs.filter(referring_facility=user.facility)
        else:
            qs = qs.filter(created_by=user)

        q = request.query_params.get("q", "").strip()
        if q:
            qs = qs.filter(
                Q(patient__patient_name__icontains=q) |
                Q(patient__hospital_id__icontains=q)
            )

        return Response(EmergencyCaseListSerializer(qs.order_by("-created_at"), many=True).data)

    def post(self, request):
        if request.user.role not in ("health_worker", "superadmin"):
            return Response({"detail": "Only health workers can create emergency cases."}, status=status.HTTP_403_FORBIDDEN)
        serializer = EmergencyCaseCreateSerializer(data=request.data, context={"request": request})
        if serializer.is_valid():
            case = serializer.save()
            return Response(EmergencyCaseDetailSerializer(case).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class EmergencyCaseDetailView(APIView):
    permission_classes = [IsAuthenticated, IsHealthWorkerOrFacilityAdmin]

    def _get_case(self, case_id, user):
        try:
            case = EmergencyCase.objects.select_related(
                "patient", "created_by", "referring_facility"
            ).prefetch_related("triage_notes__created_by").get(id=case_id)
        except EmergencyCase.DoesNotExist:
            return None, Response({"detail": "Case not found."}, status=status.HTTP_404_NOT_FOUND)

        if user.role == "superadmin":
            return case, None
        if user.role == "facility_admin" and case.referring_facility_id == user.facility_id:
            return case, None
        if case.created_by_id == user.id:
            return case, None
        return None, Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

    def get(self, request, id):
        case, err = self._get_case(id, request.user)
        if err:
            return err
        return Response(EmergencyCaseDetailSerializer(case).data)

    def patch(self, request, id):
        case, err = self._get_case(id, request.user)
        if err:
            return err
        if request.user.role == "health_worker" and case.created_by_id != request.user.id:
            return Response({"detail": "You can only edit cases you created."}, status=status.HTTP_403_FORBIDDEN)
        serializer = EmergencyCaseUpdateSerializer(case, data=request.data, partial=True)
        if serializer.is_valid():
            case = serializer.save()
            return Response(EmergencyCaseDetailSerializer(case).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, id):
        if request.user.role != "superadmin":
            return Response({"detail": "Only superadmins can delete cases."}, status=status.HTTP_403_FORBIDDEN)
        case, err = self._get_case(id, request.user)
        if err:
            return err
        case.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TriageNoteCreateView(APIView):
    permission_classes = [IsAuthenticated, IsHealthWorkerOrFacilityAdmin]

    def post(self, request, id):
        try:
            case = EmergencyCase.objects.get(id=id)
        except EmergencyCase.DoesNotExist:
            return Response({"detail": "Case not found."}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        can_access = (
            user.role == "superadmin"
            or (user.role == "facility_admin" and case.referring_facility_id == user.facility_id)
            or case.created_by_id == user.id
        )
        if not can_access:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        serializer = TriageNoteSerializer(data=request.data)
        if serializer.is_valid():
            TriageNote.objects.create(emergency_case=case, note=serializer.validated_data["note"], created_by=request.user)
            case = EmergencyCase.objects.select_related("patient", "created_by", "referring_facility").prefetch_related("triage_notes__created_by").get(id=id)
            return Response(EmergencyCaseDetailSerializer(case).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class SuggestFacilitiesView(APIView):
    permission_classes = [IsAuthenticated, IsHealthWorkerOrFacilityAdmin]

    def get(self, request, id):
        try:
            case = EmergencyCase.objects.select_related("patient", "referring_facility").get(id=id)
        except EmergencyCase.DoesNotExist:
            return Response({"detail": "Case not found."}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        can_access = (
            user.role == "superadmin"
            or (user.role == "facility_admin" and case.referring_facility_id == user.facility_id)
            or case.created_by_id == user.id
        )
        if not can_access:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        try:
            from apps.referrals.engine import get_facility_recommendations
            result = get_facility_recommendations(case)
            return Response(result)
        except Exception as e:
            return Response({"detail": "Recommendation engine error.", "error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
