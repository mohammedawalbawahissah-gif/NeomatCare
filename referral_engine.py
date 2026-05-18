"""
referral_engine.py
------------------
AI-assisted referral scoring engine.
"""
from dataclasses import dataclass, field
from enum import Enum
from typing import List
import math


class DangerSign(str, Enum):
    PPH                  = "PPH"
    APH                  = "APH"
    RUPTURED_UTERUS      = "RUPTURED_UTERUS"
    ECLAMPSIA            = "ECLAMPSIA"
    SEVERE_PRE_ECLAMPSIA = "SEVERE_PRE_ECLAMPSIA"
    OBSTRUCTED_LABOUR    = "OBSTRUCTED_LABOUR"
    CORD_PROLAPSE        = "CORD_PROLAPSE"
    PUERPERAL_SEPSIS     = "PUERPERAL_SEPSIS"
    CHORIOAMNIONITIS     = "CHORIOAMNIONITIS"
    NEONATAL_DISTRESS    = "NEONATAL_DISTRESS"
    PRETERM_LABOUR       = "PRETERM_LABOUR"
    NEONATAL_SEPSIS      = "NEONATAL_SEPSIS"
    SEVERE_ANAEMIA       = "SEVERE_ANAEMIA"
    MALPRESENTATION      = "MALPRESENTATION"


class ConfidenceLevel(str, Enum):
    HIGH   = "HIGH"
    MEDIUM = "MEDIUM"
    LOW    = "LOW"


REQUIREMENTS = {
    DangerSign.PPH:                  {"services": {"BLOOD_BANK", "SURGERY", "ICU"},  "min_level": 3},
    DangerSign.APH:                  {"services": {"BLOOD_BANK", "SURGERY"},         "min_level": 2},
    DangerSign.RUPTURED_UTERUS:      {"services": {"SURGERY", "ICU", "BLOOD_BANK"},  "min_level": 3},
    DangerSign.ECLAMPSIA:            {"services": {"ICU", "OBSTETRICS"},             "min_level": 2},
    DangerSign.SEVERE_PRE_ECLAMPSIA: {"services": {"ICU", "OBSTETRICS"},             "min_level": 2},
    DangerSign.OBSTRUCTED_LABOUR:    {"services": {"SURGERY", "OBSTETRICS"},         "min_level": 2},
    DangerSign.CORD_PROLAPSE:        {"services": {"SURGERY", "OBSTETRICS"},         "min_level": 2},
    DangerSign.PUERPERAL_SEPSIS:     {"services": {"ICU", "OBSTETRICS"},             "min_level": 2},
    DangerSign.CHORIOAMNIONITIS:     {"services": {"OBSTETRICS", "SURGERY"},         "min_level": 2},
    DangerSign.NEONATAL_DISTRESS:    {"services": {"NICU"},                          "min_level": 2},
    DangerSign.PRETERM_LABOUR:       {"services": {"NICU", "OBSTETRICS"},            "min_level": 2},
    DangerSign.NEONATAL_SEPSIS:      {"services": {"NICU"},                          "min_level": 2},
    DangerSign.SEVERE_ANAEMIA:       {"services": {"BLOOD_BANK"},                    "min_level": 2},
    DangerSign.MALPRESENTATION:      {"services": {"SURGERY", "OBSTETRICS"},         "min_level": 2},
}

AVG_SPEED_KMH = 60.0


@dataclass
class CaseSnapshot:
    id: str
    danger_signs: List[str]
    referring_facility_lat: float
    referring_facility_lng: float


@dataclass
class FacilitySnapshot:
    id: str
    name: str
    level: int
    latitude: float
    longitude: float
    available_services: List[str] = field(default_factory=list)
    icu_beds_available: int = 0
    nicu_cots_available: int = 0
    theatre_available: bool = False
    blood_bank: bool = False
    on_call_specialist: bool = False


@dataclass
class FacilitySuggestion:
    facility: FacilitySnapshot
    score: float
    capability_score: float
    distance_km: float
    estimated_travel_minutes: float
    reason_codes: List[str]
    confidence: str
    rank: int = 0


@dataclass
class EngineResult:
    recommendations: List[FacilitySuggestion]
    confidence: str
    required_services: List[str]
    engine_version: str = "1.0.0"


def haversine_km(lat1, lng1, lat2, lng2):
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _parse_requirements(danger_signs):
    required_services = set()
    min_level = 1
    for sign_str in danger_signs:
        try:
            sign = DangerSign(sign_str)
            req = REQUIREMENTS.get(sign, {})
            required_services.update(req.get("services", set()))
            min_level = max(min_level, req.get("min_level", 1))
        except ValueError:
            pass
    return required_services, min_level


def _implicit_services(f):
    services = set(f.available_services)
    if f.theatre_available:
        services.add("SURGERY")
    if f.blood_bank:
        services.add("BLOOD_BANK")
    if f.icu_beds_available > 0:
        services.add("ICU")
    if f.nicu_cots_available > 0:
        services.add("NICU")
    return services


class ReferralEngine:

    def __init__(self, search_radius_km=300.0):
        self.search_radius_km = search_radius_km

    def suggest(self, case, facilities, top_n=3):
        required, min_level = _parse_requirements(case.danger_signs)
        scored = []

        for f in facilities:
            dist = haversine_km(
                case.referring_facility_lat, case.referring_facility_lng,
                f.latitude, f.longitude,
            )
            if dist > self.search_radius_km:
                continue

            reasons = []
            services = _implicit_services(f)

            if f.level < min_level:
                capability_score = 0.0
                reasons.append(f"LEVEL_INSUFFICIENT_{f.level}_REQUIRED_{min_level}")
            elif required:
                matched = required & services
                missing = required - services
                capability_score = len(matched) / len(required)
                if matched:
                    reasons.append(f"HAS_{len(matched)}_OF_{len(required)}_REQUIRED_SERVICES")
                if missing:
                    reasons.append(f"MISSING_{'_'.join(sorted(missing))}")
            else:
                capability_score = 1.0

            bonus = 0.0
            if f.theatre_available:
                bonus += 10
                reasons.append("THEATRE_AVAILABLE")
            if f.blood_bank and "BLOOD_BANK" in required:
                bonus += 10
                reasons.append("BLOOD_BANK_AVAILABLE")
            if f.icu_beds_available > 0 and "ICU" in required:
                bonus += 10
                reasons.append(f"ICU_BEDS_{f.icu_beds_available}")
            if f.nicu_cots_available > 0 and "NICU" in required:
                bonus += 10
                reasons.append(f"NICU_COTS_{f.nicu_cots_available}")
            if f.on_call_specialist:
                bonus += 5
                reasons.append("SPECIALIST_ON_CALL")

            distance_penalty = min(dist / 10, 20)
            score = round((capability_score * 50) + bonus + (f.level * 2) - distance_penalty, 2)
            travel_minutes = round((dist / AVG_SPEED_KMH) * 60, 1)

            missing = required - services if required else set()
            if capability_score == 1.0 and score >= 60:
                confidence = ConfidenceLevel.HIGH
            elif capability_score >= 0.5 and score >= 40:
                confidence = ConfidenceLevel.MEDIUM
            else:
                confidence = ConfidenceLevel.LOW

            scored.append(FacilitySuggestion(
                facility=f,
                score=score,
                capability_score=round(capability_score, 4),
                distance_km=round(dist, 2),
                estimated_travel_minutes=travel_minutes,
                reason_codes=reasons,
                confidence=confidence.value,
            ))

        scored.sort(key=lambda x: x.score, reverse=True)

        # top includes all scored (for unit tests that check capability_score)
        top = scored[:top_n]
        for i, s in enumerate(top):
            s.rank = i + 1

        if top and top[0].confidence == ConfidenceLevel.HIGH.value:
            overall = ConfidenceLevel.HIGH
        elif top and top[0].confidence == ConfidenceLevel.MEDIUM.value:
            overall = ConfidenceLevel.MEDIUM
        else:
            overall = ConfidenceLevel.LOW

        return EngineResult(
            recommendations=top,
            confidence=overall.value,
            required_services=sorted(required),
        )


def suggestion_to_dict(result):
    # Filter out zero-capability facilities from API responses
    visible = [s for s in result.recommendations if s.capability_score > 0.0]
    return {
        "engine_version":    result.engine_version,
        "confidence":        result.confidence,
        "required_services": result.required_services,
        "recommendations": [
            {
                "rank":                     s.rank,
                "facility_id":              s.facility.id,
                "facility_name":            s.facility.name,
                "facility_level":           s.facility.level,
                "score":                    s.score,
                "capability_score":         s.capability_score,
                "distance_km":              s.distance_km,
                "estimated_travel_minutes": s.estimated_travel_minutes,
                "confidence":               s.confidence,
                "reason_codes":             s.reason_codes,
            }
            for s in visible
        ],
    }