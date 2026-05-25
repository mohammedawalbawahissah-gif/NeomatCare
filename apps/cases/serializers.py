"""
apps/cases/serializers.py
--------------------------
PatientSerializer             — create and read de-identified patient records
EmergencyCaseCreateSerializer — validate and create a full emergency case
EmergencyCaseListSerializer   — lightweight list view (no triage notes)
EmergencyCaseDetailSerializer — full detail including triage notes
TriageNoteSerializer          — create and read triage notes
"""
from rest_framework import serializers
from .models import Patient, EmergencyCase, TriageNote, DangerSign, VITAL_SIGNS_SCHEMA


class PatientSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Patient
        fields = [
            "id",
            "patient_name",
            "hospital_id",
            "patient_phone_number",
            "age",
            "district",
            "blood_group",
            "anc_visits",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class TriageNoteSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.name", read_only=True)

    class Meta:
        model  = TriageNote
        fields = ["id", "note", "created_by_name", "created_at"]
        read_only_fields = ["id", "created_by_name", "created_at"]


class EmergencyCaseCreateSerializer(serializers.Serializer):
    """
    Validates and creates both a Patient and an EmergencyCase in one
    request — the frontend doesn't need a separate patient creation step.

    patient.*        — de-identified patient fields
    case.*           — clinical fields for the emergency case

    The referring_facility defaults to the creating user's home facility
    but can be overridden (e.g. a roving health worker).
    """

    # ── Patient fields ────────────────────────────────────────────────────
    patient_name         = serializers.CharField(max_length=200, required=False, allow_blank=True)
    hospital_id          = serializers.CharField(max_length=100, required=False, allow_blank=True)
    patient_phone_number = serializers.CharField(max_length=20,  required=False, allow_blank=True)
    patient_age          = serializers.IntegerField(min_value=10, max_value=60)
    patient_district     = serializers.CharField(max_length=100, required=False, allow_blank=True)
    patient_blood_group  = serializers.ChoiceField(
        choices=["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"],
        default="unknown",
    )
    patient_anc_visits   = serializers.IntegerField(min_value=0, default=0)

    # ── Case fields ───────────────────────────────────────────────────────
    gestational_age_weeks = serializers.IntegerField(min_value=0, max_value=45, required=False, allow_null=True)
    gravida               = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    parity                = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    presenting_complaint  = serializers.CharField()
    danger_signs          = serializers.ListField(
        child=serializers.ChoiceField(choices=[d.value for d in DangerSign]),
        required=False,
        default=list,
    )
    vital_signs           = serializers.DictField(required=False, default=dict)
    fetal_heart_rate      = serializers.IntegerField(
        min_value=50, max_value=250,
        required=False, allow_null=True,
    )
    membranes_status      = serializers.ChoiceField(
        choices=["intact", "ruptured", "unknown"],
        default="unknown",
    )
    obstetric_history     = serializers.CharField(required=False, allow_blank=True)
    referring_facility    = serializers.UUIDField(required=False, allow_null=True)

    def validate_vital_signs(self, value):
        """
        Accept partial vital signs — not all may be measurable in the field.
        Reject any key that isn't in the known schema.
        """
        allowed_keys = set(VITAL_SIGNS_SCHEMA.keys())
        unknown_keys = set(value.keys()) - allowed_keys
        if unknown_keys:
            raise serializers.ValidationError(
                f"Unknown vital sign keys: {unknown_keys}. "
                f"Allowed: {allowed_keys}"
            )
        return value

    def validate(self, attrs):
        # If no referring_facility is provided, fall back to the user's facility
        request = self.context.get("request")
        if not attrs.get("referring_facility") and request:
            if not request.user.facility_id:
                raise serializers.ValidationError(
                    {"referring_facility": (
                        "No referring facility provided and your account "
                        "is not linked to a facility. Please specify one."
                    )}
                )
        return attrs

    def create(self, validated_data):
        from apps.facilities.models import HealthFacility

        request = self.context["request"]

        # ── Create the Patient ────────────────────────────────────────────
        patient = Patient.objects.create(
            patient_name         = validated_data.get("patient_name", ""),
            hospital_id          = validated_data.get("hospital_id", ""),
            patient_phone_number = validated_data.get("patient_phone_number", ""),
            age                  = validated_data["patient_age"],
            district             = validated_data.get("patient_district", ""),
            blood_group          = validated_data.get("patient_blood_group", "unknown"),
            anc_visits           = validated_data.get("patient_anc_visits", 0),
        )

        # ── Resolve referring facility ────────────────────────────────────
        facility_id = validated_data.get("referring_facility") or request.user.facility_id
        referring_facility = HealthFacility.objects.get(id=facility_id)

        # ── Create the EmergencyCase ──────────────────────────────────────
        case = EmergencyCase.objects.create(
            patient               = patient,
            gestational_age_weeks = validated_data.get("gestational_age_weeks"),
            gravida               = validated_data.get("gravida"),
            parity                = validated_data.get("parity"),
            presenting_complaint  = validated_data["presenting_complaint"],
            danger_signs          = validated_data.get("danger_signs", []),
            vital_signs           = validated_data.get("vital_signs", {}),
            fetal_heart_rate      = validated_data.get("fetal_heart_rate"),
            membranes_status      = validated_data.get("membranes_status", "unknown"),
            obstetric_history     = validated_data.get("obstetric_history", ""),
            created_by            = request.user,
            referring_facility    = referring_facility,
        )
        return case

class EmergencyCaseUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating an existing emergency case.

    Allows partial updates to editable clinical fields only.
    Patient identity and creator metadata are protected.
    """

    class Meta:
        model = EmergencyCase
        fields = [
            "gestational_age_weeks",
            "gravida",
            "parity",
            "presenting_complaint",
            "danger_signs",
            "vital_signs",
            "fetal_heart_rate",
            "membranes_status",
            "obstetric_history",
            "referring_facility",
        ]

    def validate_vital_signs(self, value):
        """
        Accept partial vital signs updates.
        Reject unknown keys.
        """
        allowed_keys = set(VITAL_SIGNS_SCHEMA.keys())
        unknown_keys = set(value.keys()) - allowed_keys

        if unknown_keys:
            raise serializers.ValidationError(
                f"Unknown vital sign keys: {unknown_keys}. "
                f"Allowed: {allowed_keys}"
            )

        return value

class EmergencyCaseListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for list views.
    Does not include triage notes or full patient detail.
    """
    created_by_name         = serializers.CharField(source="created_by.name", read_only=True)
    referring_facility_name = serializers.CharField(source="referring_facility.name", read_only=True)
    patient_age             = serializers.IntegerField(source="patient.age", read_only=True)
    patient_name            = serializers.CharField(source="patient.patient_name", read_only=True)
    hospital_id             = serializers.CharField(source="patient.hospital_id", read_only=True)

    class Meta:
        model  = EmergencyCase
        fields = [
            "id",
            "patient_name",
            "hospital_id",
            "patient_age",
            "gestational_age_weeks",
            "danger_signs",
            "membranes_status",
            "referring_facility_name",
            "created_by_name",
            "created_at",
        ]


class EmergencyCaseDetailSerializer(serializers.ModelSerializer):
    """
    Full detail serializer — includes patient info and triage notes.
    Returned on GET /api/emergency-cases/{id}/
    """
    patient                 = PatientSerializer(read_only=True)
    triage_notes            = TriageNoteSerializer(many=True, read_only=True)
    created_by_name         = serializers.CharField(source="created_by.name", read_only=True)
    referring_facility_name = serializers.CharField(
        source="referring_facility.name", read_only=True
    )

    class Meta:
        model  = EmergencyCase
        fields = [
            "id",
            "patient",
            "gestational_age_weeks", "gravida", "parity",
            "presenting_complaint",
            "danger_signs",
            "vital_signs",
            "fetal_heart_rate",
            "membranes_status",
            "obstetric_history",
            "referring_facility_name",
            "created_by_name",
            "triage_notes",
            "created_at",
        ]
