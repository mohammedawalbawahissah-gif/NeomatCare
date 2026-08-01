"""
apps/cases/followup_service.py
--------------------------------
Item (C) of the offline-first plan: routine follow-up actions for a health
worker with no smartphone/no data — not just emergency referral. Scoped
deliberately narrow (see README Roadmap for why): two read/write actions,
both keyed by a patient's Hospital ID, both usable from USSD (menu-driven)
and SMS (typed command), sharing this one implementation so the two
channels can never drift out of sync on what "status" or "a follow-up
note" actually means.

    check_patient_status(hospital_id) -> str | None
        Read-only. A short, phone-screen-sized summary: risk level, ANC
        visits, pregnancy due date if applicable, whether there's an
        active referral, and the linked household's food-security status
        if any. Returns None if no patient matches.

    log_followup_note(hospital_id, worker, text) -> Patient | None
        Write. Appends a timestamped, attributed line to the patient's
        existing Patient.notes field (not a separate log table — see the
        module-level note below on why that's the deliberate v1 choice).
        Returns the Patient on success, None if no match.

Both are intentionally READ/APPEND only — neither can change a risk
level, a referral, or anything clinically load-bearing. That's the
safety boundary that makes it reasonable to expose these over USSD/SMS
with only a Hospital ID as authentication (the same boundary
ussd_service.py's emergency flow relies on, but that flow at least
requires a registered phone AND creates an auditable, staff-reviewed
referral — a follow-up note is lower-stakes by design).

Why append to Patient.notes rather than a new PatientNote model: this is
the narrow v1 the roadmap asked for. A single free-text field with
timestamped, attributed lines is enough to make a follow-up visible to
facility staff in the app immediately, without a migration, a new
serializer, or new views. If usage shows this needs real structure
(querying "all follow-ups this week", filtering by author, etc.), that's
the natural point to promote it to its own model — deliberately not
building that ahead of evidence it's needed.
"""
from django.utils import timezone


def format_patient_status(patient) -> str:
    lines = [f"{patient.patient_name or 'Unnamed'}, Age {patient.age}"]
    lines.append(f"Risk: {patient.get_risk_level_display().upper()}")

    if patient.patient_type == "maternal":
        lines.append(f"ANC visits: {patient.anc_visits}")
        if patient.expected_delivery_date:
            lines.append(f"EDD: {patient.expected_delivery_date.isoformat()}")

    referral = (
        patient.cases.filter(referral__isnull=False)
        .exclude(referral__status__in=("COMPLETED", "CANCELLED", "FAILED"))
        .order_by("-created_at")
        .first()
    )
    if referral is not None:
        lines.append(f"Active referral: {referral.referral.status}")
    else:
        lines.append("Active referral: None")

    if patient.household_id and patient.household.food_security_flag:
        lines.append(f"Household food security: {patient.household.get_food_security_flag_display()}")

    return "\n".join(lines)


def check_patient_status(hospital_id: str) -> str | None:
    from apps.cases.models import Patient

    patient = (
        Patient.objects.filter(hospital_id__iexact=hospital_id)
        .select_related("household")
        .first()
    )
    if not patient:
        return None
    return format_patient_status(patient)


def log_note_for_patient(patient, worker, text: str):
    """Core of log_followup_note() below, taking an already-resolved
    Patient — used directly by the household follow-up flow, which has
    already looked the patient up as part of listing household members
    and shouldn't need a second Hospital ID round-trip."""
    timestamp = timezone.now().strftime("%Y-%m-%d %H:%M")
    channel = getattr(worker, "_followup_channel", "field")
    entry = f"[{timestamp} {channel} by {worker.name}] {text.strip()}"
    patient.notes = f"{patient.notes}\n{entry}".strip() if patient.notes else entry
    patient.save(update_fields=["notes"])
    return patient


def log_followup_note(hospital_id: str, worker, text: str):
    from apps.cases.models import Patient

    patient = Patient.objects.filter(hospital_id__iexact=hospital_id).first()
    if not patient:
        return None
    return log_note_for_patient(patient, worker, text)


def format_nutrition_tips(patient) -> str:
    """
    Shared by: USSD/SMS worker lookup (household member action menu, and
    the NUTRITION <hospital id> SMS command) AND patient self-service
    (identified by her own phone number — see ussd_service.py's identity
    branch). Reuses apps.wellness.services' existing snapshot functions —
    the exact same content the app's own Nutrition tab shows — rather
    than duplicating any nutrition logic here.

    Deliberately skips the AI-enhanced local-food suggestion
    (apps.wellness.views._with_ai_local_food) that the app's HTTP
    endpoints apply: that call can take a few seconds, which the app
    tolerates with a loading spinner but a live USSD session cannot —
    Africa's Talking expects a response within roughly 10 seconds, and
    ussd_service.py already runs tight on that budget for the emergency
    flow without adding a network call to Claude on top. The plain
    curated local_food_tips list (already computed, no network call) is
    used directly instead — same underlying data, just without the
    optional personalised phrasing layer.
    """
    from apps.wellness.services import (
        get_pregnancy_snapshot, get_adult_nutrition_snapshot, get_child_nutrition_snapshot,
    )

    if patient.patient_type == "child":
        snap = get_child_nutrition_snapshot(patient)
        core_tips = snap["feeding_tips"] if snap else []
    elif patient.wellness_type == "wellness":
        snap = get_adult_nutrition_snapshot(patient)
        core_tips = snap["feeding_tips"] if snap else []
    else:
        snap = get_pregnancy_snapshot(patient)
        core_tips = snap["trimester_content"]["nutrition"] if snap else []

    if not snap:
        return "No nutrition guidance on file yet for this record."

    lines = list(core_tips[:2])
    local_food = snap.get("local_food_tips") or []
    if local_food:
        lines.append(local_food[0])

    if not lines:
        return "No specific tips available right now."
    return "\n".join(f"- {l}" for l in lines)
