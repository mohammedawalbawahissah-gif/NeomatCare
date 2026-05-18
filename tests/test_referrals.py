"""
tests/test_referrals.py
------------------------
Integration tests for the full referral lifecycle:
  - Engine suggestion endpoint
  - Referral creation
  - State machine transitions
  - Invalid transition rejection
  - Timeline
  - Outcome recording
"""
import pytest
from apps.referrals.models import Referral, ReferralStatusLog


@pytest.mark.django_db
class TestReferralSuggest:

    def test_suggest_returns_ranked_facilities(
        self, auth_worker, pph_case, facility_level2, facility_level4
    ):
        response = auth_worker.post(
            "/api/referrals/suggest/",
            {"emergency_case_id": str(pph_case.id)},
            format="json",
        )
        assert response.status_code == 200
        data = response.json()
        assert "recommendations" in data
        assert "confidence" in data
        assert "engine_version" in data

    def test_suggest_excludes_incapable_facilities(
        self, auth_worker, pph_case, facility_level2
    ):
        """Level 2 without blood bank should score 0 for PPH case."""
        response = auth_worker.post(
            "/api/referrals/suggest/",
            {"emergency_case_id": str(pph_case.id)},
            format="json",
        )
        assert response.status_code == 200
        recs = response.json()["recommendations"]
        # Level 2 without blood bank should not be ranked #1
        if recs:
            assert recs[0]["facility_level"] >= 3

    def test_suggest_requires_auth(self, api_client, pph_case):
        response = api_client.post(
            "/api/referrals/suggest/",
            {"emergency_case_id": str(pph_case.id)},
            format="json",
        )
        assert response.status_code == 401

    def test_suggest_invalid_case_id(self, auth_worker):
        response = auth_worker.post(
            "/api/referrals/suggest/",
            {"emergency_case_id": "00000000-0000-0000-0000-000000000000"},
            format="json",
        )
        assert response.status_code == 404


@pytest.mark.django_db
class TestReferralCreate:

    def test_create_referral_success(
        self, auth_worker, pph_case, facility_level4
    ):
        response = auth_worker.post(
            "/api/referrals/create/",
            {
                "emergency_case_id":     str(pph_case.id),
                "receiving_facility_id": str(facility_level4.id),
                "engine_version":        "1.0.0",
            },
            format="json",
        )
        assert response.status_code == 201
        data = response.json()
        assert data["status"] == "DRAFT"
        assert data["receiving_facility_name"] == facility_level4.name

    def test_duplicate_referral_rejected(
        self, auth_worker, pph_case, facility_level4
    ):
        """Cannot create two referrals for the same case."""
        auth_worker.post(
            "/api/referrals/create/",
            {
                "emergency_case_id":     str(pph_case.id),
                "receiving_facility_id": str(facility_level4.id),
            },
            format="json",
        )
        response = auth_worker.post(
            "/api/referrals/create/",
            {
                "emergency_case_id":     str(pph_case.id),
                "receiving_facility_id": str(facility_level4.id),
            },
            format="json",
        )
        assert response.status_code == 400

    def test_override_without_reason_rejected(
        self, auth_worker, pph_case, facility_level4, facility_level2
    ):
        """Selecting a different facility than the engine without a reason must fail."""
        response = auth_worker.post(
            "/api/referrals/create/",
            {
                "emergency_case_id":       str(pph_case.id),
                "receiving_facility_id":   str(facility_level2.id),
                "engine_recommendation_id": str(facility_level4.id),
                # override_reason intentionally omitted
            },
            format="json",
        )
        assert response.status_code == 400
        assert "override_reason" in response.json()

    def test_override_with_reason_accepted(
        self, auth_worker, pph_case, facility_level4, facility_level2
    ):
        response = auth_worker.post(
            "/api/referrals/create/",
            {
                "emergency_case_id":        str(pph_case.id),
                "receiving_facility_id":    str(facility_level2.id),
                "engine_recommendation_id": str(facility_level4.id),
                "override_reason":          "Patient's family requested closer facility.",
            },
            format="json",
        )
        assert response.status_code == 201


@pytest.mark.django_db
class TestStateMachine:

    @pytest.fixture
    def draft_referral(self, auth_worker, pph_case, facility_level4):
        response = auth_worker.post(
            "/api/referrals/create/",
            {
                "emergency_case_id":     str(pph_case.id),
                "receiving_facility_id": str(facility_level4.id),
            },
            format="json",
        )
        return response.json()

    def test_valid_transition_draft_to_pending(
        self, auth_worker, draft_referral
    ):
        referral_id = draft_referral["id"]
        response = auth_worker.patch(
            f"/api/referrals/{referral_id}/status/",
            {"status": "PENDING", "note": "Sent to receiving facility."},
            format="json",
        )
        assert response.status_code == 200
        assert response.json()["status"] == "PENDING"

    def test_invalid_transition_rejected(
        self, auth_worker, draft_referral
    ):
        """Cannot jump from DRAFT directly to COMPLETED."""
        referral_id = draft_referral["id"]
        response = auth_worker.patch(
            f"/api/referrals/{referral_id}/status/",
            {"status": "COMPLETED"},
            format="json",
        )
        assert response.status_code == 400

    def test_full_lifecycle(self, auth_worker, draft_referral):
        """Walk a referral through every valid state to COMPLETED."""
        rid = draft_referral["id"]

        for transition in ["PENDING", "ACCEPTED", "IN_TRANSIT", "RECEIVED", "COMPLETED"]:
            r = auth_worker.patch(
                f"/api/referrals/{rid}/status/",
                {"status": transition},
                format="json",
            )
            assert r.status_code == 200, f"Failed at {transition}: {r.json()}"
            assert r.json()["status"] == transition

    def test_terminal_state_blocks_further_transitions(
        self, auth_worker, draft_referral
    ):
        rid = draft_referral["id"]
        # Cancel it
        auth_worker.patch(
            f"/api/referrals/{rid}/status/",
            {"status": "CANCELLED"},
            format="json",
        )
        # Try to move it again
        response = auth_worker.patch(
            f"/api/referrals/{rid}/status/",
            {"status": "PENDING"},
            format="json",
        )
        assert response.status_code == 400

    def test_status_log_written_on_each_transition(
        self, auth_worker, draft_referral
    ):
        rid = draft_referral["id"]
        auth_worker.patch(
            f"/api/referrals/{rid}/status/",
            {"status": "PENDING"},
            format="json",
        )
        # DRAFT entry on create + PENDING transition = 2 logs
        logs = ReferralStatusLog.objects.filter(referral_id=rid)
        assert logs.count() == 2


@pytest.mark.django_db
class TestTimeline:

    def test_timeline_returns_ordered_log(
        self, auth_facility_admin, auth_worker, pph_case, facility_level4
    ):
        # Create and advance the referral
        r = auth_worker.post(
            "/api/referrals/create/",
            {
                "emergency_case_id":     str(pph_case.id),
                "receiving_facility_id": str(facility_level4.id),
            },
            format="json",
        )
        rid = r.json()["id"]
        auth_worker.patch(
            f"/api/referrals/{rid}/status/",
            {"status": "PENDING"},
            format="json",
        )

        response = auth_facility_admin.get(f"/api/referrals/{rid}/timeline/")
        assert response.status_code == 200
        logs = response.json()
        assert len(logs) == 2
        assert logs[0]["to_status"] == "DRAFT"
        assert logs[1]["to_status"] == "PENDING"


@pytest.mark.django_db
class TestOutcome:

    def test_outcome_recorded_on_received_referral(
        self, auth_facility_admin, auth_worker, pph_case, facility_level4
    ):
        r = auth_worker.post(
            "/api/referrals/create/",
            {
                "emergency_case_id":     str(pph_case.id),
                "receiving_facility_id": str(facility_level4.id),
            },
            format="json",
        )
        rid = r.json()["id"]

        for s in ["PENDING", "ACCEPTED", "IN_TRANSIT", "RECEIVED"]:
            auth_worker.patch(
                f"/api/referrals/{rid}/status/",
                {"status": s},
                format="json",
            )

        response = auth_facility_admin.patch(
            f"/api/referrals/{rid}/outcome/",
            {
                "maternal_outcome": "survived",
                "neonatal_outcome": "survived",
                "outcome_notes":    "Patient stabilised, discharged after 3 days.",
            },
            format="json",
        )
        assert response.status_code == 200
        data = response.json()
        assert data["maternal_outcome"] == "survived"
        assert data["neonatal_outcome"] == "survived"

    def test_outcome_rejected_on_draft_referral(
        self, auth_facility_admin, auth_worker, pph_case, facility_level4
    ):
        r = auth_worker.post(
            "/api/referrals/create/",
            {
                "emergency_case_id":     str(pph_case.id),
                "receiving_facility_id": str(facility_level4.id),
            },
            format="json",
        )
        rid = r.json()["id"]
        response = auth_facility_admin.patch(
            f"/api/referrals/{rid}/outcome/",
            {"maternal_outcome": "survived", "neonatal_outcome": "survived"},
            format="json",
        )
        assert response.status_code == 400


@pytest.mark.django_db
class TestHealthCheck:

    def test_health_endpoint_returns_ok(self, api_client):
        response = api_client.get("/api/health/")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
        assert response.json()["db"] == "ok"
