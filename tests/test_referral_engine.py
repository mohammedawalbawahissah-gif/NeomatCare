"""
tests/test_referral_engine.py
------------------------------
Unit tests for the referral engine.
These tests run without Django DB access — pure logic tests.
"""
import pytest
from referral_engine import (
    ReferralEngine,
    CaseSnapshot,
    FacilitySnapshot,
    DangerSign,
    ConfidenceLevel,
    haversine_km,
    suggestion_to_dict,
)


# ── Helpers ───────────────────────────────────────────────────────────────────
def make_facility(id, name, level, lat, lng, **kwargs) -> FacilitySnapshot:
    defaults = dict(
        available_services=[],
        icu_beds_available=0,
        nicu_cots_available=0,
        theatre_available=False,
        blood_bank=False,
        on_call_specialist=False,
    )
    defaults.update(kwargs)
    return FacilitySnapshot(id=id, name=name, level=level, latitude=lat, longitude=lng, **defaults)


def make_case(danger_signs, lat=5.614, lng=-0.205) -> CaseSnapshot:
    return CaseSnapshot(
        id="test-case",
        danger_signs=danger_signs,
        referring_facility_lat=lat,
        referring_facility_lng=lng,
    )


# ── Haversine ─────────────────────────────────────────────────────────────────
class TestHaversine:
    def test_same_point_is_zero(self):
        assert haversine_km(5.614, -0.205, 5.614, -0.205) == 0.0

    def test_known_distance_accra_kumasi(self):
        # Accra → Kumasi is roughly 250 km
        dist = haversine_km(5.6037, -0.1870, 6.6885, -1.6244)
        assert 190 < dist < 220

    def test_symmetrical(self):
        d1 = haversine_km(5.0, -0.2, 6.0, -1.0)
        d2 = haversine_km(6.0, -1.0, 5.0, -0.2)
        assert abs(d1 - d2) < 0.001


# ── Capability matching ───────────────────────────────────────────────────────
class TestCapabilityMatching:

    def test_pph_requires_blood_bank_and_theatre(self):
        """A PPH case must be routed to a facility with blood bank + theatre."""
        engine = ReferralEngine()

        without_blood = make_facility("f1", "No Blood", 3, 5.65, -0.19,
                                      theatre_available=True, on_call_specialist=True)
        with_blood    = make_facility("f2", "Full", 3, 5.68, -0.15,
                                      theatre_available=True, blood_bank=True,
                                      on_call_specialist=True, icu_beds_available=2)

        case   = make_case([DangerSign.PPH.value])
        result = engine.suggest(case, [without_blood, with_blood])

        assert result.recommendations[0].facility.id == "f2"
        assert result.recommendations[0].capability_score == 1.0

    def test_level_insufficient_scores_zero(self):
        """A facility below minimum level gets a zero capability score."""
        engine  = ReferralEngine()
        low_lvl = make_facility("f1", "Level 1", 1, 5.62, -0.20,
                                 theatre_available=True, blood_bank=True,
                                 on_call_specialist=True)
        case    = make_case([DangerSign.PPH.value])
        result  = engine.suggest(case, [low_lvl])

        assert result.recommendations[0].capability_score == 0.0

    def test_eclampsia_requires_icu_and_specialist(self):
        """Eclampsia requires ICU bed and on-call specialist."""
        engine = ReferralEngine()

        no_icu = make_facility("f1", "No ICU", 3, 5.65, -0.19,
                                on_call_specialist=True)
        with_icu = make_facility("f2", "ICU+Spec", 3, 5.68, -0.15,
                                  icu_beds_available=3, on_call_specialist=True)

        case   = make_case([DangerSign.ECLAMPSIA.value])
        result = engine.suggest(case, [no_icu, with_icu])

        assert result.recommendations[0].facility.id == "f2"

    def test_nearer_facility_wins_when_capability_equal(self):
        """When two facilities are equally capable, the closer one ranks first."""
        engine = ReferralEngine()

        near = make_facility("near", "Near", 2, 5.62, -0.21,
                              theatre_available=True, on_call_specialist=True)
        far  = make_facility("far",  "Far",  2, 5.90, -0.50,
                              theatre_available=True, on_call_specialist=True)

        case   = make_case([DangerSign.OBSTRUCTED_LABOUR.value])
        result = engine.suggest(case, [far, near])

        assert result.recommendations[0].facility.id == "near"

    def test_multiple_danger_signs_aggregated(self):
        """PPH + NEONATAL_DISTRESS requires blood bank + theatre + NICU."""
        engine = ReferralEngine()

        no_nicu   = make_facility("f1", "No NICU", 3, 5.65, -0.19,
                                   theatre_available=True, blood_bank=True,
                                   on_call_specialist=True)
        full      = make_facility("f2", "Full", 3, 5.68, -0.15,
                                   theatre_available=True, blood_bank=True,
                                   on_call_specialist=True, nicu_cots_available=4,
                                   icu_beds_available=2)

        case   = make_case([DangerSign.PPH.value, DangerSign.NEONATAL_DISTRESS.value])
        result = engine.suggest(case, [no_nicu, full])

        assert result.recommendations[0].facility.id == "f2"


# ── Confidence levels ─────────────────────────────────────────────────────────
class TestConfidence:

    def test_high_confidence_with_full_match_and_alternatives(self):
        engine = ReferralEngine()
        f1 = make_facility("f1", "A", 3, 5.65, -0.19,
                            theatre_available=True, blood_bank=True, on_call_specialist=True,
                            icu_beds_available=2)
        f2 = make_facility("f2", "B", 3, 5.68, -0.15,
                            theatre_available=True, blood_bank=True, on_call_specialist=True,
                            icu_beds_available=3)
        case   = make_case([DangerSign.PPH.value])
        result = engine.suggest(case, [f1, f2])
        assert result.confidence == ConfidenceLevel.HIGH

    def test_low_confidence_when_no_capable_facility(self):
        engine = ReferralEngine()
        bad = make_facility("f1", "Bad", 1, 5.65, -0.19)
        case   = make_case([DangerSign.PPH.value])
        result = engine.suggest(case, [bad])
        assert result.confidence == ConfidenceLevel.LOW


# ── Radius filtering ──────────────────────────────────────────────────────────
class TestRadiusFilter:

    def test_facility_outside_radius_excluded(self):
        engine = ReferralEngine(search_radius_km=50)
        far    = make_facility("far", "Far", 3, 8.0, 1.0,   # ~400 km away
                                theatre_available=True, blood_bank=True,
                                on_call_specialist=True, icu_beds_available=2)
        case   = make_case([DangerSign.PPH.value])
        result = engine.suggest(case, [far])
        assert len(result.recommendations) == 0

    def test_facility_within_radius_included(self):
        engine = ReferralEngine(search_radius_km=150)
        near   = make_facility("near", "Near", 3, 5.68, -0.15,
                                theatre_available=True, blood_bank=True,
                                on_call_specialist=True, icu_beds_available=2)
        case   = make_case([DangerSign.PPH.value])
        result = engine.suggest(case, [near])
        assert len(result.recommendations) == 1


# ── suggestion_to_dict ────────────────────────────────────────────────────────
class TestSuggestionToDict:

    def test_output_is_json_serialisable(self):
        import json
        engine = ReferralEngine()
        f      = make_facility("f1", "Test", 3, 5.65, -0.19,
                                theatre_available=True, blood_bank=True,
                                on_call_specialist=True, icu_beds_available=2)
        case   = make_case([DangerSign.PPH.value])
        result = engine.suggest(case, [f])
        d      = suggestion_to_dict(result)
        # Should not raise
        json.dumps(d)

    def test_output_contains_required_keys(self):
        engine = ReferralEngine()
        f      = make_facility("f1", "Test", 3, 5.65, -0.19,
                                theatre_available=True, blood_bank=True,
                                on_call_specialist=True, icu_beds_available=2)
        case   = make_case([DangerSign.PPH.value])
        result = engine.suggest(case, [f])
        d      = suggestion_to_dict(result)

        assert "engine_version"    in d
        assert "confidence"        in d
        assert "recommendations"   in d
        assert "required_services" in d
        for rec in d["recommendations"]:
            assert "rank"                     in rec
            assert "distance_km"              in rec
            assert "estimated_travel_minutes" in rec
            assert "reason_codes"             in rec
