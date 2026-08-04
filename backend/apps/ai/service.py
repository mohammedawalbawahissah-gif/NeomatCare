"""
ai_service.py
─────────────
Central AI service for NeoMatCare.
Wraps the Anthropic API and provides typed helpers for each AI capability:

  1. triage_extract       — extract structured danger signs from free-text triage notes
  2. risk_narrate         — turn raw risk_flags into a plain-language clinical summary
  3. anc_anomaly_detect   — cross-analyse ANC visit series for concerning patterns
  4. referral_handover    — draft a specialist clinical handover brief
  5. transport_recommend  — recommend optimal vehicle given case urgency + travel time
  6. chat                 — role-aware conversational assistant
  7. local_food_suggestion — turn the curated local-food table into a
                              personalised, locally-worded nutrition tip
  8. facility_recommendation — AI second-opinion ranking over a pre-vetted
                                candidate facility list, for referral creation

All functions are synchronous (Django-friendly). Each raises AIServiceError on failure.
"""

import os
import json
import logging
from dataclasses import dataclass
from typing import Any

import anthropic

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-5"
MAX_TOKENS = 1024

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))


class AIServiceError(Exception):
    pass


def _call(system: str, user: str, max_tokens: int = MAX_TOKENS) -> str:
    """Low-level wrapper — returns raw text content."""
    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return response.content[0].text
    except anthropic.APIError as exc:
        logger.error("Anthropic API error: %s", exc)
        raise AIServiceError(str(exc)) from exc


def _call_json(system: str, user: str, max_tokens: int = MAX_TOKENS) -> Any:
    """Like _call but returns parsed JSON. Strips markdown fences."""
    raw = _call(system, user, max_tokens)
    clean = raw.strip()
    if clean.startswith("```"):
        clean = clean.split("\n", 1)[-1]
        clean = clean.rsplit("```", 1)[0]
    try:
        return json.loads(clean.strip())
    except json.JSONDecodeError as exc:
        logger.error("JSON parse failed. Raw: %s", raw[:300])
        raise AIServiceError(f"AI returned invalid JSON: {exc}") from exc


# ── 1. Triage Extraction ──────────────────────────────────────────────────────

VALID_DANGER_SIGNS = [
    "PPH", "APH", "RUPTURED_UTERUS", "ECLAMPSIA", "SEVERE_PRE_ECLAMPSIA",
    "OBSTRUCTED_LABOUR", "CORD_PROLAPSE", "PUERPERAL_SEPSIS", "CHORIOAMNIONITIS",
    "NEONATAL_DISTRESS", "PRETERM_LABOUR", "NEONATAL_SEPSIS", "SEVERE_ANAEMIA",
    "MALPRESENTATION",
]

TRIAGE_SYSTEM = f"""You are a clinical AI assistant for a maternal and neonatal emergency referral system in Ghana.
Your task is to analyse a health worker's free-text triage note and extract structured clinical information.

Return ONLY valid JSON with this exact schema (no prose, no markdown fences):
{{
  "danger_signs": [<list of matching codes from the allowed set>],
  "presenting_complaint_suggestion": "<1-2 sentence clean presenting complaint>",
  "severity": "critical" | "high" | "moderate" | "low",
  "key_observations": [<up to 4 brief clinical observations from the text>],
  "missing_fields": [<list of important clinical fields not mentioned: e.g. "gestational age", "BP", "fetal heart rate">],
  "confidence": "high" | "medium" | "low"
}}

Allowed danger sign codes: {json.dumps(VALID_DANGER_SIGNS)}

Rules:
- Only include danger sign codes from the allowed list
- Be conservative — only flag danger signs clearly supported by the text
- Missing fields should highlight gaps a health worker should fill before referral
- Do not invent clinical details not present in the note
"""


def triage_extract(note_text: str) -> dict:
    """
    Extract structured danger signs and observations from a free-text triage note.
    Returns a dict matching TRIAGE_SYSTEM schema.
    """
    if not note_text or not note_text.strip():
        raise AIServiceError("Triage note text is empty.")
    user_msg = f"Triage note:\n{note_text.strip()}"
    return _call_json(TRIAGE_SYSTEM, user_msg)


# ── 2. Risk Narration ─────────────────────────────────────────────────────────

RISK_NARRATE_SYSTEM = """You are a clinical communication assistant for a maternal health system in Ghana.
You receive structured patient risk data and must produce a clear, compassionate,
plain-language clinical summary suitable for a health worker briefing.

Return ONLY valid JSON:
{
  "summary": "<2-3 sentence clinical summary explaining the risk level and why>",
  "action_points": ["<specific action 1>", "<specific action 2>", ...],
  "urgency_note": "<one sentence on what to watch for next>"
}

Rules:
- Use plain language understandable to a community health worker
- Be specific — reference the actual flags, not generic advice
- Maximum 3 action points
- No markdown, no headers
"""


def risk_narrate(risk_level: str, risk_flags: list, patient_context: dict = None) -> dict:
    """
    Turn raw risk_flags into a plain-language clinical summary.
    patient_context: optional dict with keys like gravida, parity, age, anc_visits.
    """
    ctx_str = ""
    if patient_context:
        ctx_str = f"\nPatient context: {json.dumps(patient_context)}"
    user_msg = f"Risk level: {risk_level}\nRisk flags: {json.dumps(risk_flags)}{ctx_str}"
    return _call_json(RISK_NARRATE_SYSTEM, user_msg)


# ── 3. ANC Anomaly Detection ──────────────────────────────────────────────────

ANC_ANOMALY_SYSTEM = """You are a maternal health clinical AI for a referral system in Ghana.
You receive a series of antenatal care (ANC) visits in chronological order and must identify
concerning patterns that should trigger a risk review or proactive alert.

Return ONLY valid JSON:
{
  "anomalies_found": true | false,
  "patterns": [
    {
      "type": "<pattern type e.g. 'rising_bp', 'missed_visits', 'weight_loss', 'decreasing_fhr'>",
      "description": "<plain-language description>",
      "severity": "high" | "medium" | "low",
      "visits_involved": [<visit indices, 0-based>]
    }
  ],
  "recommended_risk_escalation": true | false,
  "summary": "<1-2 sentence overall assessment>"
}

Rules:
- Flag BP trends if systolic rises >20 mmHg or diastolic rises >10 mmHg across visits
- Flag missed visits if gap between visits >6 weeks in third trimester
- Flag weight loss >2kg between consecutive visits
- Flag fetal heart rate outside 110-160 range
- Flag fundal height not increasing appropriately (expected ~1cm/week after 20 weeks)
- Return anomalies_found: false with empty patterns if all looks normal
"""


def anc_anomaly_detect(visits: list) -> dict:
    """
    Cross-analyse a list of ANC visit dicts for concerning patterns.
    visits: list of dicts with fields like visit_date, bp_systolic, bp_diastolic,
            weight_kg, fetal_heart_rate, fundal_height_cm, gestational_age_weeks.
    """
    if not visits:
        return {"anomalies_found": False, "patterns": [], "recommended_risk_escalation": False, "summary": "No ANC visits to analyse."}
    user_msg = f"ANC visits (chronological):\n{json.dumps(visits, default=str)}"
    return _call_json(ANC_ANOMALY_SYSTEM, user_msg)


# ── 4. Referral Handover Brief ────────────────────────────────────────────────

HANDOVER_SYSTEM = """You are a clinical documentation assistant for a maternal and neonatal emergency referral system in Ghana.
You must draft a concise clinical handover brief for a receiving specialist or facility.
This brief will be read by the receiving doctor within seconds of a patient arriving.

Return ONLY valid JSON:
{
  "brief": "<3-5 sentence clinical handover — patient background, current presentation, danger signs, interventions given, immediate needs>",
  "immediate_actions": ["<action 1>", "<action 2>", ...],
  "blood_products_likely": true | false,
  "theatre_likely": true | false,
  "icu_likely": true | false
}

Rules:
- Be concise, clinical, and actionable
- Lead with the most critical information (danger signs and vitals)
- Include all danger signs by name
- Note any interventions already given (if mentioned)
- Maximum 4 immediate actions
"""


def referral_handover(case_data: dict, patient_data: dict, referral_data: dict = None) -> dict:
    """
    Draft a clinical handover brief from case + patient + referral context.
    """
    user_msg = (
        f"Patient:\n{json.dumps(patient_data, default=str)}\n\n"
        f"Emergency case:\n{json.dumps(case_data, default=str)}\n\n"
        f"Referral info:\n{json.dumps(referral_data or {}, default=str)}"
    )
    return _call_json(HANDOVER_SYSTEM, user_msg, max_tokens=800)


# ── 5. Transport Recommendation ───────────────────────────────────────────────

TRANSPORT_SYSTEM = """You are a transport dispatch AI for a maternal and neonatal emergency referral system in Ghana.
Given a case urgency level, estimated travel time, and a list of available vehicles,
recommend the optimal vehicle to dispatch.

Return ONLY valid JSON:
{
  "recommended_vehicle_id": "<vehicle id or null>",
  "reasoning": "<1-2 sentence explanation>",
  "urgency_classification": "immediate" | "urgent" | "routine",
  "estimated_dispatch_time_minutes": <integer>,
  "alternatives": ["<vehicle_id>", ...]
}

Rules:
- For CRITICAL/HIGH urgency cases, prioritize closest vehicle regardless of type
- For MODERATE urgency, prefer ambulances over regular vehicles
- If no suitable vehicle available, set recommended_vehicle_id to null
- estimated_dispatch_time_minutes should account for vehicle preparation (~5 min) + travel to facility
"""


def transport_recommend(case_urgency: str, danger_signs: list, estimated_travel_minutes: float, vehicles: list) -> dict:
    """
    Recommend optimal transport vehicle.
    vehicles: list of dicts with id, type, status, distance_km, driver_name.
    """
    user_msg = (
        f"Case urgency: {case_urgency}\n"
        f"Danger signs: {json.dumps(danger_signs)}\n"
        f"Estimated travel to receiving facility: {estimated_travel_minutes} minutes\n"
        f"Available vehicles: {json.dumps(vehicles, default=str)}"
    )
    return _call_json(TRANSPORT_SYSTEM, user_msg)


# ── 6. Role-Aware Chat Assistant ──────────────────────────────────────────────

ROLE_SYSTEM_PROMPTS = {
    "health_worker": """You are an AI clinical assistant for health workers using the NeoMatCare emergency referral system in Ghana.
You help with:
- Identifying danger signs in maternal and neonatal emergencies
- Understanding when and how to escalate cases
- Guidance on triage, case documentation, and referral decisions
- Clinical protocols for obstetric and neonatal emergencies
- How to use the NeoMatCare platform

Be concise, clinically accurate, and sensitive to the resource constraints of frontline health workers in Ghana.
Always recommend seeking senior clinical review for critical decisions.
Do not diagnose patients — help workers document and escalate appropriately.""",

    "facility_admin": """You are an AI assistant for facility administrators using the NeoMatCare emergency referral system in Ghana.
You help with:
- Managing facility capacity, beds, and available services
- Understanding referral patterns and case volumes
- Staff and transport coordination for emergencies
- Reporting and audit of cases and outcomes
- Platform configuration and user management

Be practical and operations-focused. Help admins make their facility more responsive to maternal emergencies.""",

    "specialist": """You are an AI clinical assistant for specialist doctors and consultants using NeoMatCare in Ghana.
You help with:
- Reviewing incoming referral and consultation requests
- Understanding case history and risk profiles
- Clinical guidance on obstetric and neonatal conditions
- Documenting consultations and recommendations
- Communicating with referring health workers

Be clinical, precise, and efficient. Specialists are experienced clinicians — match their level.""",

    "driver": """You are an AI assistant for ambulance and transport drivers using the NeoMatCare dispatch system in Ghana.
You help with:
- Understanding dispatch requests and patient urgency levels
- Navigation and route guidance
- Communicating status updates on the platform
- Safety protocols for emergency patient transport
- What to do if a patient's condition changes during transport

Be clear, practical, and safety-focused.""",

    "superadmin": """You are an AI assistant for superadministrators of the NeoMatCare emergency referral system in Ghana.
You help with:
- System-wide oversight of cases, referrals, and facilities
- User management and role assignments
- Facility network management and capacity planning
- Interpreting platform data and trends
- Technical platform operations

You have full context access and can assist with any aspect of the platform.""",

    "patient": """You are a compassionate maternal health AI companion for pregnant women and mothers using the NeoMatCare patient portal in Ghana.
You help with:
- Guidance through pregnancy trimesters — what to expect, what's normal
- Warning signs that require immediate medical attention
- Antenatal care (ANC) visit information and what happens at each visit
- Postnatal care for mother and baby
- Newborn care basics
- Questions about referrals and what to expect at a receiving facility
- Emotional support and reassurance

Always be warm, clear, and in plain language. Avoid medical jargon. 
IMPORTANT: Never make specific diagnoses. Always encourage the patient to contact their health worker or visit a facility for any concerning symptoms.""",
}

DEFAULT_SYSTEM = ROLE_SYSTEM_PROMPTS["health_worker"]


def chat(messages: list, role: str = "health_worker", context: dict = None) -> str:
    """
    Role-aware conversational assistant.

    messages: list of {"role": "user"|"assistant", "content": str}
    role: user's role string
    context: optional dict of page/entity context e.g. {"page": "case_detail", "case_id": "...", "danger_signs": [...]}
    """
    system = ROLE_SYSTEM_PROMPTS.get(role, DEFAULT_SYSTEM)

    if context:
        context_str = "\n\nCurrent context:\n" + json.dumps(context, default=str)
        system = system + context_str

    if not messages:
        raise AIServiceError("No messages provided.")

    # Validate message format
    validated = []
    for m in messages:
        if m.get("role") in ("user", "assistant") and m.get("content"):
            validated.append({"role": m["role"], "content": str(m["content"])})

    if not validated:
        raise AIServiceError("No valid messages.")

    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=system,
            messages=validated,
        )
        return response.content[0].text
    except anthropic.APIError as exc:
        logger.error("Chat API error: %s", exc)
        raise AIServiceError(str(exc)) from exc


# ── 7. Local Food Suggestion (enhancement layer) ────────────────────────────
#
# This is an ENHANCEMENT on top of apps.wellness.content.get_local_food_tips()
# (the non-AI curated table), not a replacement — callers always have that
# table as a working fallback if this raises AIServiceError or the API is
# unreachable, so the feature still works offline. See the AI-enhancement
# helper in apps/wellness/views.py for how the fallback is applied.

LOCAL_FOOD_SYSTEM = """You are a nutrition assistant for a maternal and child health app used in \
Northern Ghana. You turn a short list of already-vetted, locally available foods into ONE brief, \
warm, practically-worded suggestion for a specific person.

Rules:
- Use ONLY the foods given to you. Never invent foods, prices, or nutrients not in the list.
- Keep it to 2-3 sentences, plain everyday language, no medical jargon.
- Mention the person's town/region by name if given, to make it feel local and specific.
- Do not diagnose or give medical advice — this is food guidance only.
- Return plain text only, no markdown, no preamble."""


def local_food_suggestion(curated_tips: list, region: str = "", town: str = "", audience: str = "a pregnant woman") -> str:
    """
    curated_tips: output of apps.wellness.content.get_local_food_tips() —
        the vetted list this call is allowed to draw from.
    audience: short phrase describing who this is for, e.g. "a pregnant
        woman in her second trimester", "a child aged 8 months",
        "a woman tracking her menstrual cycle".

    Raises AIServiceError on failure — callers should catch this and fall
    back to curated_tips directly (joined into a sentence), never let a
    failed AI call block the nutrition guidance from showing at all.
    """
    if not curated_tips:
        raise AIServiceError("No curated tips provided to enhance.")

    location = f"{town}, {region}" if town and region else (region or town or "Northern Ghana")
    prompt = (
        f"Person: {audience}, located in {location}.\n"
        f"Vetted local foods available to them:\n"
        + "\n".join(f"- {t}" for t in curated_tips)
        + "\n\nWrite the suggestion now."
    )
    return _call(LOCAL_FOOD_SYSTEM, prompt, max_tokens=200).strip()


# ── 8. Facility Recommendation (AI referral analysis) ───────────────────────
#
# Alternative to the deterministic scoring in referral_engine.py, offered as
# an opt-in second opinion during referral creation (see
# apps/referrals/views.py ReferralSuggestView, mode="ai"). Deliberately
# grounded: Claude is given a pre-filtered candidate list with real,
# already-computed facts (distance, level, capability match, capacity) and
# is only allowed to RANK and EXPLAIN from that list — it cannot invent a
# facility, a distance, or a capability that wasn't provided. The caller
# (ReferralSuggestView) re-validates every returned facility_id against the
# candidate set and re-attaches the real computed numbers rather than
# trusting anything the model echoes back, so a hallucinated ID or number
# can't reach the frontend. On any failure the caller falls back to the
# rule-based result — this function never gets to be a single point of
# failure for an emergency referral.

FACILITY_RECOMMENDATION_SYSTEM = """You are a clinical referral-matching assistant for a maternal and \
neonatal emergency referral system in Northern Ghana. You are given one emergency case's danger signs \
and a pre-vetted list of candidate receiving facilities, each with real data already computed for you \
(distance, facility level, which required services it has and is missing, bed/theatre/blood-bank/on-call \
availability, and a baseline rule-based score).

Your job is to rank up to 3 of these candidates for this specific case and explain your reasoning in \
plain language a health worker can quickly read under time pressure — not to recompute the numbers.

Return ONLY valid JSON, no markdown fences, no prose outside the JSON:
{
  "recommendations": [
    {"facility_id": "<must be one of the candidate ids given to you, exactly as given>",
     "rationale": "<1-2 plain-language sentences on why this facility fits this case, referencing its actual capabilities/distance>"}
  ],
  "overall_confidence": "HIGH" | "MEDIUM" | "LOW"
}

Rules:
- facility_id values MUST come only from the candidate list you were given — never invent one.
- Never state a distance, capability, or bed count that wasn't given to you in the candidate data.
- Order recommendations best-fit first. Prefer facilities that meet more of the required services, then \
weigh distance/travel time — a slightly further facility with the needed capability is usually better \
than a closer one missing something critical, unless the case is time-critical enough that distance \
should dominate (use clinical judgement on the danger signs given).
- If none of the candidates are a reasonable fit, return an empty recommendations list rather than \
forcing a bad match.
- Keep each rationale short — this is read in an emergency, not a report."""


def facility_recommendation(danger_signs: list, patient_context: dict, candidates: list) -> dict:
    """
    danger_signs: list of danger-sign codes on the case (same codes as
        referral_engine.DangerSign).
    patient_context: small dict of non-identifying context that might
        affect urgency/fit, e.g. {"patient_type": "maternal", "age": 29}.
    candidates: list of dicts, one per candidate facility, already computed
        by referral_engine — expected keys: facility_id, facility_name,
        facility_level, distance_km, estimated_travel_minutes,
        capability_score, matched_services, missing_services,
        icu_beds_available, nicu_cots_available, theatre_available,
        blood_bank, on_call_specialist, rule_based_score.

    Returns the parsed dict matching FACILITY_RECOMMENDATION_SYSTEM's
    schema. Raises AIServiceError on any failure (API error, invalid JSON,
    or zero valid candidate ids in the response) — callers must catch this
    and fall back to the rule-based engine result.
    """
    if not candidates:
        raise AIServiceError("No candidate facilities provided to analyse.")

    user_msg = (
        f"Danger signs on this case: {json.dumps(danger_signs)}\n"
        f"Patient context: {json.dumps(patient_context or {})}\n"
        f"Candidate facilities:\n{json.dumps(candidates, indent=2)}\n\n"
        f"Rank up to 3 of these candidates now."
    )
    result = _call_json(FACILITY_RECOMMENDATION_SYSTEM, user_msg, max_tokens=900)

    if not isinstance(result, dict) or "recommendations" not in result:
        raise AIServiceError("AI response missing 'recommendations'.")

    valid_ids = {c["facility_id"] for c in candidates}
    result["recommendations"] = [
        r for r in result["recommendations"]
        if isinstance(r, dict) and r.get("facility_id") in valid_ids
    ]
    if not result["recommendations"]:
        raise AIServiceError("AI returned no valid candidate facility ids.")

    return result
