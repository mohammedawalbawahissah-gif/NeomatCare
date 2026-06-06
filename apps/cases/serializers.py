"""
apps/cases/serializers.py
"""
from rest_framework import serializers
from .models import Patient, ANCVisit, PatientConsent, EmergencyCase, TriageNote, DangerSign, VITAL_SIGNS_SCHEMA


# ── ANC Visit ─────────────────────────────────────────────────────────────────

class ANCVisitSerializer(serializers.ModelSerializer):
    conducted_by_name = serializers.CharField(source="conducted_by.name", read_only=True, allow_null=True)
    facility_name     = serializers.CharField(source="facility.name", read_only=True, allow_null=True)

    class Meta:
        model  = ANCVisit
        fields = [
            "id", "visit_date", "gestational_age_weeks",
            "facility", "facility_name", "conducted_by", "conducted_by_name",
            "weight_kg", "bp_systolic", "bp_diastolic",
            "fetal_heart_rate", "fundal_height_cm",
            "notes", "concerns", "created_at",
        ]
        read_only_fields = ["id", "conducted_by", "created_at"]


# ── Consent ───────────────────────────────────────────────────────────────────

class PatientConsentSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.CharField(source="recorded_by.name", read_only=True, allow_null=True)

    class Meta:
        model  = PatientConsent
        fields = ["id", "consent_type", "action", "recorded_by_name", "notes", "timestamp"]
        read_only_fields = ["id", "recorded_by_name", "timestamp"]


# ── Patient ───────────────────────────────────────────────────────────────────

class PatientListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for patient search / list views."""
    case_count      = serializers.IntegerField(source="cases.count", read_only=True)
    last_case_date  = serializers.SerializerMethodField()

    class Meta:
        model  = Patient
        fields = [
            "id", "patient_name", "hospital_id", "patient_phone_number",
            "age", "town", "blood_group", "anc_visits",
            "risk_level", "consent_given",
            "case_count", "last_case_date", "created_at",
        ]

    def get_last_case_date(self, obj):
        last = obj.cases.order_by("-created_at").values_list("created_at", flat=True).first()
        return last


class PatientDetailSerializer(serializers.ModelSerializer):
    """Full patient detail including ANC log and consent history."""
    anc_visit_log    = ANCVisitSerializer(many=True, read_only=True)
    consents         = PatientConsentSerializer(many=True, read_only=True)
    registered_at_facility_name = serializers.CharField(
        source="registered_at_facility.name", read_only=True, allow_null=True
    )
    case_count       = serializers.IntegerField(source="cases.count", read_only=True)
    has_portal_access = serializers.SerializerMethodField()

    class Meta:
        model  = Patient
        fields = [
            "id", "patient_name", "hospital_id", "patient_phone_number",
            "age", "date_of_birth", "town", "blood_group",
            "next_of_kin_name", "next_of_kin_phone", "next_of_kin_relationship",
            "expected_delivery_date", "gravida", "parity",
            "anc_visits", "risk_level", "risk_flags", "notes",
            "consent_given", "consent_given_at",
            "registered_at_facility", "registered_at_facility_name",
            "has_portal_access",
            "case_count",
            "anc_visit_log",
            "consents",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "anc_visits", "risk_level", "risk_flags", "created_at", "updated_at"]

    def get_has_portal_access(self, obj):
        return obj.patient_user_id is not None


class PatientCreateSerializer(serializers.ModelSerializer):
    """Used when creating a standalone patient record."""
    facility = serializers.UUIDField(required=False, allow_null=True, write_only=True)

    class Meta:
        model  = Patient
        fields = [
            "patient_name", "hospital_id", "patient_phone_number",
            "age", "date_of_birth", "town", "blood_group",
            "next_of_kin_name", "next_of_kin_phone", "next_of_kin_relationship",
            "expected_delivery_date", "gravida", "parity",
            "notes", "facility",
        ]

    def create(self, validated_data):
        from apps.facilities.models import HealthFacility
        facility_id = validated_data.pop("facility", None)
        if not facility_id:
            request = self.context.get("request")
            if request and request.user.facility_id:
                facility_id = request.user.facility_id
        facility = None
        if facility_id:
            facility = HealthFacility.objects.filter(id=facility_id).first()
        return Patient.objects.create(**validated_data, registered_at_facility=facility)


class PatientUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Patient
        fields = [
            "patient_name", "hospital_id", "patient_phone_number",
            "age", "date_of_birth", "town", "blood_group",
            "next_of_kin_name", "next_of_kin_phone", "next_of_kin_relationship",
            "expected_delivery_date", "gravida", "parity", "notes",
        ]


# ── Legacy PatientSerializer (used by EmergencyCaseDetailSerializer) ──────────

class PatientSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Patient
        fields = [
            "id", "patient_name", "hospital_id", "patient_phone_number",
            "age", "town", "blood_group", "anc_visits",
            "risk_level", "next_of_kin_name", "next_of_kin_phone",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


# ── Triage Note ───────────────────────────────────────────────────────────────

class TriageNoteSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.name", read_only=True)

    class Meta:
        model  = TriageNote
        fields = ["id", "note", "created_by_name", "created_at"]
        read_only_fields = ["id", "created_by_name", "created_at"]


# ── Emergency Case ────────────────────────────────────────────────────────────

class EmergencyCaseCreateSerializer(serializers.Serializer):
    # Patient fields — can reference existing patient OR create new
    patient_id           = serializers.UUIDField(required=False, allow_null=True)
    patient_name         = serializers.CharField(max_length=200, required=False, allow_blank=True)
    hospital_id          = serializers.CharField(max_length=100, required=False, allow_blank=True)
    patient_phone_number = serializers.CharField(max_length=20, required=False, allow_blank=True)
    patient_age          = serializers.IntegerField(min_value=10, max_value=60, required=False)
    patient_town         = serializers.CharField(max_length=100, required=False, allow_blank=True)
    patient_blood_group  = serializers.ChoiceField(
        choices=["A+","A-","B+","B-","AB+","AB-","O+","O-","unknown"],
        default="unknown", required=False,
    )
    patient_anc_visits   = serializers.IntegerField(min_value=0, default=0, required=False)

    # Case fields
    gestational_age_weeks = serializers.IntegerField(min_value=0, max_value=45, required=False, allow_null=True)
    gravida               = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    parity                = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    presenting_complaint  = serializers.CharField()
    danger_signs          = serializers.ListField(
        child=serializers.ChoiceField(choices=[d.value for d in DangerSign]),
        required=False, default=list,
    )
    vital_signs           = serializers.DictField(required=False, default=dict)
    fetal_heart_rate      = serializers.IntegerField(min_value=50, max_value=250, required=False, allow_null=True)
    membranes_status      = serializers.ChoiceField(choices=["intact","ruptured","unknown"], default="unknown")
    obstetric_history     = serializers.CharField(required=False, allow_blank=True)
    referring_facility    = serializers.UUIDField(required=False, allow_null=True)

    def validate_vital_signs(self, value):
        allowed_keys = set(VITAL_SIGNS_SCHEMA.keys())
        unknown_keys = set(value.keys()) - allowed_keys
        if unknown_keys:
            raise serializers.ValidationError(f"Unknown vital sign keys: {unknown_keys}")
        return value

    def validate(self, attrs):
        # Must have either patient_id OR patient_age (for new patient)
        if not attrs.get("patient_id") and not attrs.get("patient_age"):
            raise serializers.ValidationError(
                {"patient_age": "patient_age is required when not linking an existing patient."}
            )
        request = self.context.get("request")
        if not attrs.get("referring_facility") and request:
            if not request.user.facility_id:
                raise serializers.ValidationError(
                    {"referring_facility": "No facility on your account. Please specify referring_facility."}
                )
        return attrs

    def create(self, validated_data):
        from apps.facilities.models import HealthFacility
        request = self.context["request"]

        # Resolve or create patient
        patient_id = validated_data.get("patient_id")
        if patient_id:
            try:
                patient = Patient.objects.get(id=patient_id)
            except Patient.DoesNotExist:
                raise serializers.ValidationError({"patient_id": "Patient not found."})
        else:
            patient = Patient.objects.create(
                patient_name         = validated_data.get("patient_name", ""),
                hospital_id          = validated_data.get("hospital_id", ""),
                patient_phone_number = validated_data.get("patient_phone_number", ""),
                age                  = validated_data["patient_age"],
                town                 = validated_data.get("patient_town", ""),
                blood_group          = validated_data.get("patient_blood_group", "unknown"),
                anc_visits           = validated_data.get("patient_anc_visits", 0),
                registered_at_facility = HealthFacility.objects.filter(
                    id=validated_data.get("referring_facility") or request.user.facility_id
                ).first(),
            )

        facility_id = validated_data.get("referring_facility") or request.user.facility_id
        referring_facility = HealthFacility.objects.get(id=facility_id)

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
    class Meta:
        model = EmergencyCase
        fields = [
            "gestational_age_weeks", "gravida", "parity",
            "presenting_complaint", "danger_signs", "vital_signs",
            "fetal_heart_rate", "membranes_status", "obstetric_history",
            "referring_facility", "maternal_outcome", "neonatal_outcome", "outcome_notes",
        ]

    def validate_vital_signs(self, value):
        allowed_keys = set(VITAL_SIGNS_SCHEMA.keys())
        unknown_keys = set(value.keys()) - allowed_keys
        if unknown_keys:
            raise serializers.ValidationError(f"Unknown vital sign keys: {unknown_keys}")
        return value


class EmergencyCaseListSerializer(serializers.ModelSerializer):
    created_by_name         = serializers.CharField(source="created_by.name", read_only=True)
    referring_facility_name = serializers.CharField(source="referring_facility.name", read_only=True)
    patient_age             = serializers.IntegerField(source="patient.age", read_only=True)
    patient_name            = serializers.CharField(source="patient.patient_name", read_only=True)
    hospital_id             = serializers.CharField(source="patient.hospital_id", read_only=True)
    patient_id              = serializers.UUIDField(source="patient.id", read_only=True)
    risk_level              = serializers.CharField(source="patient.risk_level", read_only=True)

    class Meta:
        model  = EmergencyCase
        fields = [
            "id", "patient_id", "patient_name", "hospital_id", "patient_age",
            "risk_level", "gestational_age_weeks",
            "danger_signs", "membranes_status",
            "maternal_outcome", "neonatal_outcome",
            "referring_facility_name", "created_by_name", "created_at",
        ]


class EmergencyCaseDetailSerializer(serializers.ModelSerializer):
    patient                 = PatientSerializer(read_only=True)
    triage_notes            = TriageNoteSerializer(many=True, read_only=True)
    created_by_name         = serializers.CharField(source="created_by.name", read_only=True)
    referring_facility_name = serializers.CharField(source="referring_facility.name", read_only=True)

    class Meta:
        model  = EmergencyCase
        fields = [
            "id", "patient",
            "gestational_age_weeks", "gravida", "parity",
            "presenting_complaint", "danger_signs",
            "vital_signs", "fetal_heart_rate", "membranes_status",
            "obstetric_history",
            "maternal_outcome", "neonatal_outcome", "outcome_notes",
            "referring_facility_name", "created_by_name",
            "triage_notes", "created_at",
        ]
