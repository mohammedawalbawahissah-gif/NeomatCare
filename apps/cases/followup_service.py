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


def _format_status(patient) -> str:
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
    return _format_status(patient)


def log_followup_note(hospital_id: str, worker, text: str):
    from apps.cases.models import Patient

    patient = Patient.objects.filter(hospital_id__iexact=hospital_id).first()
    if not patient:
        return None

    timestamp = timezone.now().strftime("%Y-%m-%d %H:%M")
    channel = getattr(worker, "_followup_channel", "field")
    entry = f"[{timestamp} {channel} by {worker.name}] {text.strip()}"
    patient.notes = f"{patient.notes}\n{entry}".strip() if patient.notes else entry
    patient.save(update_fields=["notes"])
    return patient
