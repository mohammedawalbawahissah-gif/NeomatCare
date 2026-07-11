"""
apps/referrals/serializers.py
------------------------------
ReferralCreateSerializer    — validates and creates a referral
ReferralListSerializer      — lightweight list view
ReferralDetailSerializer    — full detail with timeline
StatusUpdateSerializer      — validates state transitions
OutcomeSerializer           — records maternal and neonatal outcomes
ReferralStatusLogSerializer — single timeline entry
"""
from rest_framework import serializers
from .models import Referral, ReferralStatusLog, VALID_TRANSITIONS


class ReferralStatusLogSerializer(serializers.ModelSerializer):
    changed_by_name = serializers.CharField(source="changed_by.name", read_only=True, allow_null=True)

    class Meta:
        model  = ReferralStatusLog
        fields = ["id", "from_status", "to_status", "changed_by_name", "note", "timestamp"]


class ReferralListSerializer(serializers.ModelSerializer):
    referring_facility_name = serializers.CharField(source="referring_facility.name", read_only=True)
    receiving_facility_name = serializers.CharField(source="receiving_facility.name", read_only=True)
    created_by_name         = serializers.CharField(source="created_by.name", read_only=True)

    class Meta:
        model  = Referral
        fields = [
            "id", "status", "emergency_case_id",
            "referring_facility_name", "receiving_facility_name",
            "maternal_outcome", "neonatal_outcome",
            "created_by_name", "created_at", "updated_at",
        ]


class ReferralDetailSerializer(serializers.ModelSerializer):
    referring_facility_name    = serializers.CharField(source="referring_facility.name", read_only=True)
    receiving_facility_name    = serializers.CharField(source="receiving_facility.name", read_only=True)
    engine_recommendation_name = serializers.CharField(
        source="engine_recommendation.name", read_only=True, allow_null=True
    )
    created_by_name = serializers.CharField(source="created_by.name", read_only=True)
    timeline        = ReferralStatusLogSerializer(source="status_logs", many=True, read_only=True)
    valid_next_statuses = serializers.SerializerMethodField()

    class Meta:
        model  = Referral
        fields = [
            "id", "status", "valid_next_statuses",
            "emergency_case_id",
            "referring_facility_name", "receiving_facility_name",
            "engine_recommendation_name", "engine_version", "override_reason",
            "maternal_outcome", "neonatal_outcome", "outcome_notes",
            "created_by_name", "created_at", "updated_at",
            "timeline",
        ]

    def get_valid_next_statuses(self, obj):
        return obj.get_valid_next_statuses()


class ReferralCreateSerializer(serializers.Serializer):
    """
    Creates a referral for an existing EmergencyCase.

    If the clinician selects a different facility than the engine
    recommended, override_reason is required.
    """
    emergency_case_id      = serializers.UUIDField()
    receiving_facility_id  = serializers.UUIDField()
    engine_recommendation_id = serializers.UUIDField(required=False, allow_null=True)
    engine_version         = serializers.CharField(required=False, allow_blank=True)
    override_reason        = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        from apps.cases.models import EmergencyCase
        from apps.facilities.models import HealthFacility

        # Check the case exists and doesn't already have a referral
        try:
            case = EmergencyCase.objects.select_related("referring_facility").get(
                id=attrs["emergency_case_id"]
            )
        except EmergencyCase.DoesNotExist:
            raise serializers.ValidationError({"emergency_case_id": "Emergency case not found."})

        if hasattr(case, "referral"):
            raise serializers.ValidationError(
                {"emergency_case_id": "A referral already exists for this case."}
            )
        attrs["emergency_case"] = case

        # Check receiving facility exists and is active
        try:
            receiving = HealthFacility.objects.get(
                id=attrs["receiving_facility_id"], is_active=True
            )
        except HealthFacility.DoesNotExist:
            raise serializers.ValidationError(
                {"receiving_facility_id": "Receiving facility not found or inactive."}
            )
        attrs["receiving_facility"] = receiving

        # Enforce override reason when engine suggestion was ignored
        engine_rec_id = attrs.get("engine_recommendation_id")
        if (
            engine_rec_id
            and str(engine_rec_id) != str(attrs["receiving_facility_id"])
            and not attrs.get("override_reason")
        ):
            raise serializers.ValidationError(
                {"override_reason": (
                    "override_reason is required when selecting a different facility "
                    "than the engine recommended."
                )}
            )

        return attrs

    def create(self, validated_data):
        from apps.facilities.models import HealthFacility

        request = self.context["request"]
        case    = validated_data["emergency_case"]

        engine_rec = None
        if validated_data.get("engine_recommendation_id"):
            engine_rec = HealthFacility.objects.filter(
                id=validated_data["engine_recommendation_id"]
            ).first()

        referral = Referral.objects.create(
            emergency_case        = case,
            referring_facility    = case.referring_facility,
            receiving_facility    = validated_data["receiving_facility"],
            engine_recommendation = engine_rec,
            engine_version        = validated_data.get("engine_version", ""),
            override_reason       = validated_data.get("override_reason", ""),
            status                = "DRAFT",
            created_by            = request.user,
        )

        # Write the initial status log entry
        ReferralStatusLog.objects.create(
            referral    = referral,
            from_status = "",
            to_status   = "DRAFT",
            changed_by  = request.user,
            note        = "Referral created.",
        )

        return referral


class StatusUpdateSerializer(serializers.Serializer):
    """
    Validates a status transition against the state machine.
    """
    status = serializers.CharField()
    note   = serializers.CharField(required=False, allow_blank=True)

    def validate_status(self, value):
        value = value.upper()
        from .models import ReferralStatus
        valid_values = [s.value for s in ReferralStatus]
        if value not in valid_values:
            raise serializers.ValidationError(
                f"'{value}' is not a valid status. Choose from: {valid_values}"
            )
        return value

    def validate(self, attrs):
        referral       = self.context["referral"]
        new_status     = attrs["status"]
        valid_next     = VALID_TRANSITIONS.get(referral.status, [])

        if new_status not in valid_next:
            raise serializers.ValidationError(
                {
                    "status": (
                        f"Cannot transition from '{referral.status}' to '{new_status}'. "
                        f"Valid transitions: {valid_next}"
                    )
                }
            )
        return attrs


class OutcomeSerializer(serializers.Serializer):
    """
    Records maternal and neonatal outcomes on a completed or received referral.
    """
    maternal_outcome = serializers.ChoiceField(choices=["survived", "died", "unknown"])
    neonatal_outcome = serializers.ChoiceField(choices=["survived", "died", "unknown"])
    outcome_notes    = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        referral = self.context["referral"]
        if referral.status not in ("RECEIVED", "COMPLETED"):
            raise serializers.ValidationError(
                "Outcomes can only be recorded once the referral is in RECEIVED or COMPLETED status."
            )
        return attrs