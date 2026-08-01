"""
apps/cases/household_service.py
---------------------------------
Household follow-up over USSD/SMS — the household-management design
scoped in the offline-first roadmap discussion, built now alongside the
nutrition additions. Two ways in, both dodging the "browse a long list on
a keypad" problem that ruled out full household CRUD:

    find_household_by_member_hid(hospital_id) -> Household | None
        Any household member's Hospital ID resolves the whole household —
        the common case, since a health worker visiting a household
        usually already knows at least one member's ID.

    search_households_by_household_name(query, limit=5) -> QuerySet
        Head-of-household name search, capped — more than `limit` matches
        asks the caller to narrow further rather than paginating a long
        list, which a keypad can't do well anyway.

format_household_summary() and format_member_list() render the two
screens a session needs (which household, which member) in a form small
enough for a feature-phone screen.

Visit logging is deliberately blunt, not clinical — "no concerns" or "a
concern, described in one line" — see log_anc_visit/log_growth_visit.
Real vitals (BP, weight, MUAC, fundal height) stay app-only; multi-tap
keypad entry for numeric clinical data is slow and error-prone in a way
a smartphone form isn't, and that data already has a home in the app.
This is a presence-and-flag log, not a replacement for the real one.

"Recent households" (a third, lower-certainty access path) was
deliberately deferred — see the README Roadmap entry for why.
"""
from django.utils import timezone


def find_household_by_member_hid(hospital_id: str):
    from apps.cases.models import Patient

    patient = Patient.objects.filter(hospital_id__iexact=hospital_id).select_related("household").first()
    if not patient or not patient.household_id:
        return None
    return patient.household


def search_households_by_household_name(query: str, limit: int = 5):
    from apps.cases.models import Household

    return Household.objects.filter(head_name__icontains=query.strip())[: limit + 1]


def format_household_summary(household) -> str:
    lines = [f"{household.head_name or 'Household'} ({household.town or 'no town on file'})"]
    if household.food_security_flag:
        lines.append(f"Food security: {household.get_food_security_flag_display()}")
    return "\n".join(lines)


def get_household_members(household, limit: int = 5):
    """Capped, not paginated — a household with more than `limit` members
    still returns only the first `limit`; the USSD/SMS layer tells the
    caller to use the app for the rest rather than trying to page a
    keypad-driven list."""
    return list(household.members.all().order_by("patient_name")[:limit])


def format_member_list(members) -> str:
    lines = []
    for i, m in enumerate(members, start=1):
        kind = "Child" if m.patient_type == "child" else "Maternal"
        lines.append(f"{i}. {m.patient_name or 'Unnamed'} ({m.age}, {kind})")
    return "\n".join(lines)


def log_anc_visit(patient, worker, concern_text: str = None):
    from apps.cases.models import ANCVisit

    note = concern_text.strip() if concern_text else "No concerns reported."
    visit = ANCVisit.objects.create(
        patient=patient,
        visit_date=timezone.now().date(),
        facility=worker.facility,
        conducted_by=worker,
        notes=f"[USSD/SMS follow-up] {note}",
    )
    patient.anc_visits = (patient.anc_visits or 0) + 1
    patient.save(update_fields=["anc_visits"])
    return visit


def log_growth_visit(patient, worker, concern_text: str = None):
    from apps.cases.models import GrowthRecord

    note = concern_text.strip() if concern_text else "No concerns reported."
    return GrowthRecord.objects.create(
        patient=patient,
        record_date=timezone.now().date(),
        facility=worker.facility,
        recorded_by=worker,
        notes=f"[USSD/SMS follow-up] {note}",
    )


def log_visit(patient, worker, concern_text: str = None):
    """Dispatches to the right log type by patient_type — the one call
    site both USSD and SMS need."""
    if patient.patient_type == "child":
        return log_growth_visit(patient, worker, concern_text)
    return log_anc_visit(patient, worker, concern_text)
