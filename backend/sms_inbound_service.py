"""
sms_inbound_service.py
------------------------
SMS-triggered referral for NeoMatCare — inbound Africa's Talking SMS
webhook. Item 5.1 of the offline-first plan, the counterpart to
ussd_service.py: a health worker texts a short command to a fixed
number to create an emergency referral, riding the SMS/voice network
rather than mobile data — reaches areas with 2G coverage but no usable
data connection, and needs nothing beyond a basic phone's messaging app.

This is genuinely the highest-leverage piece of the three offline
fallbacks: unlike USSD, it doesn't require the health worker to be
mid-session with the network at the moment of dialling — an SMS sits in
the carrier's queue and gets delivered whenever the phone next has any
signal at all, so this is also the path least likely to be dropped by a
brief signal window.

Also supports several routine, non-emergency commands (items (C) and the
household/nutrition additions — see apps/cases/followup_service.py and
apps/cases/household_service.py), all replying directly to the sender by
SMS since there's no receiving facility to notify for any of them:
    STATUS <hospital id>              — a short status summary
    NOTE <hospital id> <note text>    — appends a follow-up note
    HOUSEHOLD <a member's hospital id> — that household's summary + members
    VISIT <hospital id> OK             — logs a no-concerns visit
    VISIT <hospital id> CONCERN <text> — logs a visit with a concern noted
    NUTRITION <hospital id>            — staff: that patient's nutrition tips

NUTRITION also works from a PATIENT's own phone number (matched against
Patient.patient_phone_number, not a staff account — see _handle_patient_sms):
    NUTRITION                          — her own nutrition guidance
    NUTRITION CHILD [name]             — a linked child's guidance (name
                                          only needed if more than one)

Message format (case-insensitive, keyword order doesn't matter beyond
"REFER <age> <rest>"):
    REFER <age> <free text describing the danger sign(s)>
Example (hand-typed by a health worker with no app at all):
    "REFER 28 heavy bleeding after delivery, weak and dizzy"

The app additionally composes optional tags into <rest> — HID:<hospital
id>, NAME:<patient name>, REF:<local queue reference> — anywhere in the
free text, order-independent (see mobile/src/utils/smsReferralFallback.js
buildAutoReferralSmsBody). A hand-typed message never includes these and
doesn't need to; they're additive and backward compatible. HID, when
present and matching a real patient, links this referral to that
patient's existing record instead of creating a duplicate — same fix,
same reasoning, as ussd_service.py's Hospital ID lookup.

The free-text part (tags stripped out) is best-effort keyword-matched
against the same curated DANGER_SIGN_MENU ussd_service.py uses (kept
identical rather than duplicated with different codes, so both channels
route through the exact same referral_engine scoring). An unmatched
message still creates a referral — DangerSign detection here is a
convenience for engine routing, not a requirement; a health worker
completes full details in the app once connectivity returns, same as the
USSD path.

Place this file at the project root (next to ussd_service.py,
sms_service.py, referral_engine.py). Wire the URL in config/urls.py:
    path("sms/inbound/", include("apps.referrals.sms_inbound_urls"))

Africa's Talking POSTs application/x-www-form-urlencoded to the inbound
SMS callback with (at minimum): from, to, text, date, id, linkId. Field
names per their inbound-SMS webhook docs — worth a final check against
current AT docs before go-live, same caveat as ussd_service.py's header.
"""
import logging
import re

logger = logging.getLogger(__name__)

# Identical codes/order to ussd_service.DANGER_SIGN_MENU — deliberately
# not imported from there, since keyword-matching free text needs extra
# synonym phrases the numbered USSD menu doesn't (a USSD caller picks "1",
# an SMS sender types "bleeding" in their own words).
DANGER_SIGN_KEYWORDS = [
    ("PPH", ["heavy bleeding", "bleeding after delivery", "bleeding after birth", "pph"]),
    ("ECLAMPSIA", ["convulsion", "convulsing", "fit", "fitting", "seizure", "eclampsia"]),
    ("OBSTRUCTED_LABOUR", ["obstructed labour", "obstructed labor", "prolonged labour", "prolonged labor"]),
    ("APH", ["bleeding before birth", "bleeding in pregnancy", "aph"]),
    ("SEVERE_PRE_ECLAMPSIA", ["severe headache", "blurred vision", "high bp", "high blood pressure", "pre-eclampsia", "preeclampsia"]),
    ("NEONATAL_DISTRESS", ["baby in distress", "baby not moving", "baby not breathing", "neonatal distress"]),
]

REFER_PATTERN = re.compile(r"^\s*REFER\s+(\d{1,3})\s+(.+)$", re.IGNORECASE | re.DOTALL)

# Item (C) — routine, non-emergency follow-up actions, mirroring the same
# two USSD menu items (ussd_service.py "Check Patient Status" / "Log
# Follow-Up Note"), sharing apps/cases/followup_service.py so both
# channels can never drift on what these actually do. Unlike REFER, these
# get a direct SMS reply back to the sender (send_sms below) — there's no
# receiving facility to notify, the sender IS the audience.
STATUS_PATTERN = re.compile(r"^\s*STATUS\s+(\S+)\s*$", re.IGNORECASE)
NOTE_PATTERN   = re.compile(r"^\s*NOTE\s+(\S+)\s+(.+)$", re.IGNORECASE | re.DOTALL)

# Household follow-up (staff only) — mirrors ussd_service.py's Household
# Follow-Up menu, Hospital-ID path only (no name search over SMS — a
# single command with no back-and-forth has nowhere to show a numbered
# disambiguation list, so this stays to the unambiguous entry point).
HOUSEHOLD_PATTERN     = re.compile(r"^\s*HOUSEHOLD\s+(\S+)\s*$", re.IGNORECASE)
VISIT_OK_PATTERN      = re.compile(r"^\s*VISIT\s+(\S+)\s+OK\s*$", re.IGNORECASE)
VISIT_CONCERN_PATTERN = re.compile(r"^\s*VISIT\s+(\S+)\s+CONCERN\s+(.+)$", re.IGNORECASE | re.DOTALL)

# NUTRITION works two ways on the same command word:
#   Staff, with a Hospital ID: "NUTRITION H12345"  -> looks up that patient.
#   A patient's own phone, no argument: "NUTRITION" -> her own guidance;
#     "NUTRITION CHILD" or "NUTRITION CHILD <name>" -> a child's guidance.
# Dispatch on argument shape happens in _handle, since which of these
# applies depends on WHO is texting, not just the text itself.
NUTRITION_STAFF_PATTERN   = re.compile(r"^\s*NUTRITION\s+(\S+)\s*$", re.IGNORECASE)
NUTRITION_SELF_PATTERN    = re.compile(r"^\s*NUTRITION\s*$", re.IGNORECASE)
NUTRITION_CHILD_PATTERN   = re.compile(r"^\s*NUTRITION\s+CHILD\s*(.*)$", re.IGNORECASE | re.DOTALL)

# App-composed optional tags, order-independent within the free-text
# portion. NAME must stop at the next recognised tag (or end of string)
# since a name can contain spaces — HID and REF can't (Hospital IDs and
# local queue ids are both single tokens), so those are simpler \S+ matches.
_HID_TAG  = re.compile(r"\bHID:(\S+)", re.IGNORECASE)
_REF_TAG  = re.compile(r"\bREF:(\S+)", re.IGNORECASE)
_NAME_TAG = re.compile(r"\bNAME:(.+?)(?=\s+HID:|\s+REF:|\s+NAME:|$)", re.IGNORECASE | re.DOTALL)


def _extract_tags(free_text: str) -> tuple:
    """Returns (hospital_id, patient_name, client_ref, remaining_text) —
    remaining_text has all three tags stripped out, safe to pass to
    _match_danger_signs() without a tag value (e.g. a name) accidentally
    keyword-matching as a danger sign."""
    hid_match  = _HID_TAG.search(free_text)
    name_match = _NAME_TAG.search(free_text)
    ref_match  = _REF_TAG.search(free_text)

    remaining = free_text
    for pattern in (_HID_TAG, _NAME_TAG, _REF_TAG):
        remaining = pattern.sub("", remaining)

    return (
        hid_match.group(1).strip() if hid_match else None,
        name_match.group(1).strip() if name_match else None,
        ref_match.group(1).strip() if ref_match else None,
        remaining.strip(),
    )


def _match_danger_signs(free_text: str) -> list:
    text_lower = free_text.lower()
    matched = []
    for code, keywords in DANGER_SIGN_KEYWORDS:
        # Match either a lay phrase (someone typing their own words) OR the
        # raw code itself (the mobile app's SMS fallback sends the app's own
        # DangerSign codes directly rather than composing lay phrasing —
        # see mobile/src/utils/smsReferralFallback.js).
        if any(kw in text_lower for kw in keywords) or code.lower() in text_lower:
            matched.append(code)
    return matched


def handle_inbound_sms(sender_phone: str, text: str, message_id: str = "") -> dict:
    """
    Entry point for the SMS webhook view. Never raises — any internal
    error is logged and reported back as a dict the view can 200 on,
    since Africa's Talking will retry a non-2xx response and we don't
    want duplicate cases from provider retries on our own bugs.
    Returns {"status": ..., "detail": ..., optionally "referral_id"/"facility_name"}.
    """
    try:
        return _handle(sender_phone, text, message_id)
    except Exception:
        logger.exception("SMS inbound handler error for message %s from %s", message_id, sender_phone)
        return {"status": "error", "detail": "Internal error handling SMS."}


def _handle(sender_phone: str, text: str, message_id: str) -> dict:
    from apps.accounts.models import User
    from apps.cases.models import Patient

    worker = (
        User.objects.filter(
            phone_number=sender_phone,
            role__in=("health_worker", "facility_admin"),
            is_active=True,
        )
        .select_related("facility")
        .first()
    )

    if worker is None:
        # Not staff — check whether this is a patient's own number instead.
        # Only NUTRITION is offered to a patient sender; every other
        # command below stays staff-only. See ussd_service.py's identical
        # identity branch for the same reasoning.
        patient = Patient.objects.filter(patient_phone_number=sender_phone).select_related("household").first()
        if patient is not None:
            return _handle_patient_sms(sender_phone, text, patient)

        logger.warning("SMS attempt from unregistered number %s", sender_phone)
        return {"status": "unregistered", "detail": "Sender phone number is not registered with NeoMatCare."}

    if not worker.facility_id:
        return {"status": "no_facility", "detail": "Sender has no facility on file."}

    stripped = (text or "").strip()

    status_match = STATUS_PATTERN.match(stripped)
    if status_match:
        from apps.cases.followup_service import check_patient_status
        from sms_service import send_sms

        hospital_id = status_match.group(1)
        summary = check_patient_status(hospital_id)
        if summary is None:
            send_sms(sender_phone, f"NeoMatCare: No patient found with Hospital ID {hospital_id}.")
            return {"status": "not_found", "detail": "No patient matched that Hospital ID."}
        send_sms(sender_phone, f"NeoMatCare Patient Status:\n{summary}")
        return {"status": "status_sent", "detail": "Status summary sent by SMS."}

    note_match = NOTE_PATTERN.match(stripped)
    if note_match:
        from apps.cases.followup_service import log_followup_note
        from sms_service import send_sms

        hospital_id, note_text = note_match.group(1), note_match.group(2).strip()
        worker._followup_channel = "SMS"
        patient = log_followup_note(hospital_id, worker, note_text)
        if patient is None:
            send_sms(sender_phone, f"NeoMatCare: No patient found with Hospital ID {hospital_id}. Note not saved.")
            return {"status": "not_found", "detail": "No patient matched that Hospital ID."}
        send_sms(sender_phone, f"NeoMatCare: Note saved for {patient.patient_name or 'patient'}.")
        return {"status": "note_saved", "detail": f"Follow-up note saved for {patient.patient_name}."}

    household_match = HOUSEHOLD_PATTERN.match(stripped)
    if household_match:
        from apps.cases.household_service import find_household_by_member_hid, format_household_summary, get_household_members, format_member_list
        from sms_service import send_sms

        hospital_id = household_match.group(1)
        household = find_household_by_member_hid(hospital_id)
        if household is None:
            send_sms(sender_phone, f"NeoMatCare: No household found for Hospital ID {hospital_id}.")
            return {"status": "not_found", "detail": "No household matched that Hospital ID."}
        members = get_household_members(household)
        more = "\n(+more — use the app to see all)" if household.members.count() > len(members) else ""
        send_sms(sender_phone, f"NeoMatCare Household:\n{format_household_summary(household)}\n{format_member_list(members)}{more}")
        return {"status": "household_sent", "detail": "Household summary sent by SMS."}

    visit_ok_match = VISIT_OK_PATTERN.match(stripped)
    visit_concern_match = None if visit_ok_match else VISIT_CONCERN_PATTERN.match(stripped)
    if visit_ok_match or visit_concern_match:
        from apps.cases.models import Patient as PatientModel
        from apps.cases.household_service import log_visit
        from sms_service import send_sms

        hospital_id = (visit_ok_match or visit_concern_match).group(1)
        concern = visit_concern_match.group(2).strip() if visit_concern_match else None
        patient = PatientModel.objects.filter(hospital_id__iexact=hospital_id).first()
        if patient is None:
            send_sms(sender_phone, f"NeoMatCare: No patient found with Hospital ID {hospital_id}. Visit not saved.")
            return {"status": "not_found", "detail": "No patient matched that Hospital ID."}
        worker._followup_channel = "SMS"
        log_visit(patient, worker, concern_text=concern)
        tag = "with a concern noted" if concern else "no concerns"
        send_sms(sender_phone, f"NeoMatCare: Visit logged for {patient.patient_name or 'patient'} — {tag}.")
        return {"status": "visit_logged", "detail": f"Visit logged for {patient.patient_name}."}

    nutrition_match = NUTRITION_STAFF_PATTERN.match(stripped)
    if nutrition_match:
        from apps.cases.models import Patient as PatientModel
        from apps.cases.followup_service import format_nutrition_tips
        from sms_service import send_sms

        hospital_id = nutrition_match.group(1)
        patient = PatientModel.objects.filter(hospital_id__iexact=hospital_id).first()
        if patient is None:
            send_sms(sender_phone, f"NeoMatCare: No patient found with Hospital ID {hospital_id}.")
            return {"status": "not_found", "detail": "No patient matched that Hospital ID."}
        send_sms(sender_phone, f"NeoMatCare Nutrition Tips:\n{format_nutrition_tips(patient)}")
        return {"status": "nutrition_sent", "detail": "Nutrition tips sent by SMS."}

    match = REFER_PATTERN.match(text or "")
    if not match:
        return {
            "status": "format_error",
            "detail": 'Message did not match "REFER <age> <details>" format.',
        }

    age = int(match.group(1))
    if not (0 < age < 120):
        return {"status": "invalid_age", "detail": "Age out of range."}

    raw_rest = match.group(2).strip()
    hospital_id, patient_name, client_ref, free_text = _extract_tags(raw_rest)
    danger_signs = _match_danger_signs(free_text)

    result = _create_sms_referral(
        worker, age, free_text, danger_signs, message_id,
        hospital_id=hospital_id, patient_name=patient_name, client_ref=client_ref,
    )
    if not result:
        return {
            "status": "no_facility_routed",
            "detail": "No suitable receiving facility could be found for auto-routing.",
        }

    return {
        "status": "created",
        "detail": f"Referral created and routed to {result['facility_name']}.",
        "referral_id": result["ref_id"],
        "facility_name": result["facility_name"],
    }


def _handle_patient_sms(sender_phone: str, text: str, patient) -> dict:
    """
    Nutrition self-service by SMS — the same audience and same single
    purpose as ussd_service.py's _handle_patient, just without a
    back-and-forth session (one SMS in, one reply out). Only NUTRITION,
    NUTRITION CHILD, and NUTRITION CHILD <name> are recognised here;
    anything else from a patient-only number is told what commands exist
    rather than treated as an error.
    """
    from apps.cases.followup_service import format_nutrition_tips
    from sms_service import send_sms

    stripped = (text or "").strip()

    child_match = NUTRITION_CHILD_PATTERN.match(stripped)
    if child_match:
        children = list(patient.household.members.filter(patient_type="child")) if patient.household_id else []
        if not children:
            send_sms(sender_phone, "NeoMatCare: No child is on file for your household.")
            return {"status": "not_found", "detail": "No child linked to this patient's household."}

        name_arg = child_match.group(1).strip()
        if name_arg:
            child = next((c for c in children if name_arg.lower() in (c.patient_name or "").lower()), None)
            if not child:
                send_sms(sender_phone, f"NeoMatCare: No child named '{name_arg}' found. Reply NUTRITION CHILD to see options.")
                return {"status": "not_found", "detail": "No child matched that name."}
        elif len(children) == 1:
            child = children[0]
        else:
            names = ", ".join(c.patient_name or "Child" for c in children)
            send_sms(sender_phone, f"NeoMatCare: You have more than one child on file ({names}). Reply NUTRITION CHILD <name>.")
            return {"status": "ambiguous", "detail": "Multiple children — name required."}

        send_sms(sender_phone, f"NeoMatCare Nutrition Tips for {child.patient_name or 'your child'}:\n{format_nutrition_tips(child)}")
        return {"status": "nutrition_sent", "detail": f"Child nutrition tips sent for {child.patient_name}."}

    if NUTRITION_SELF_PATTERN.match(stripped):
        send_sms(sender_phone, f"NeoMatCare Nutrition Tips:\n{format_nutrition_tips(patient)}")
        return {"status": "nutrition_sent", "detail": "Nutrition tips sent by SMS."}

    send_sms(sender_phone, "NeoMatCare: Reply NUTRITION for your own tips, or NUTRITION CHILD for your child's.")
    return {"status": "help_sent", "detail": "Sent available commands to a patient-only number."}


def _create_sms_referral(
    worker, age: int, free_text: str, danger_signs: list, message_id: str,
    hospital_id: str = None, patient_name: str = None, client_ref: str = None,
) -> dict | None:
    """
    Mirrors ussd_service._create_ussd_referral's shape and posture closely
    (existing-patient lookup via Hospital ID, same referral_engine
    routing, same DRAFT->PENDING transition to trigger the existing
    signals.py SMS-notification pipeline) — kept as a near-duplicate
    rather than a shared helper because the two channels' inputs differ
    just enough (free-text complaint here vs a fixed label there, and this
    one has no interactive confirm step — see the module docstring on why
    that tradeoff is acceptable for SMS) that a shared function would need
    a branch for it anyway; this is more readable side by side with
    ussd_service.py's version.

    Unlike the USSD flow, there's no confirm-before-create step here — an
    inbound SMS is a single fire-and-forget message, not a multi-screen
    session, so this creates immediately on receipt. hospital_id looks up
    an existing patient (falls back to creating a new one, tagged in the
    case notes, if the id doesn't match anything — never hard-fails a
    referral over a typo'd id).

    idempotency: uses the AT message id (when provided) to avoid a
    provider retry creating a second referral for the same SMS.
    """
    from apps.cases.models import Patient, EmergencyCase
    from apps.facilities.models import HealthFacility
    from apps.referrals.models import Referral, ReferralStatusLog
    from referral_engine import ReferralEngine, CaseSnapshot, FacilitySnapshot

    if message_id:
        existing = EmergencyCase.objects.filter(
            created_by=worker, presenting_complaint__contains=f"[sms:{message_id}]"
        ).first()
        if existing and hasattr(existing, "referral"):
            referral = existing.referral
            return {"facility_name": referral.receiving_facility.name, "ref_id": str(referral.id)[:8].upper()}

    complaint_tag = f" [sms:{message_id}]" if message_id else ""
    client_ref_tag = f" [ref:{client_ref}]" if client_ref else ""

    patient = None
    hid_note = ""
    if hospital_id:
        patient = Patient.objects.filter(hospital_id__iexact=hospital_id).first()
        if not patient:
            hid_note = f" (Hospital ID '{hospital_id}' not found — created as new)"

    if patient:
        complaint = f"Referral initiated via SMS (offline channel) for existing patient: {free_text}{complaint_tag}{client_ref_tag}"
    else:
        patient = Patient.objects.create(
            patient_name=patient_name or "SMS Emergency Referral",
            age=age,
            patient_type="maternal",
            wellness_type="maternal",
        )
        complaint = f"Referral initiated via SMS (offline channel){hid_note}: {free_text}{complaint_tag}{client_ref_tag}"

    case = EmergencyCase.objects.create(
        patient=patient,
        presenting_complaint=complaint,
        danger_signs=danger_signs,
        referring_facility=worker.facility,
        created_by=worker,
    )

    case_snap = CaseSnapshot(
        id=str(case.id),
        danger_signs=case.danger_signs,
        referring_facility_lat=worker.facility.latitude,
        referring_facility_lng=worker.facility.longitude,
    )
    facilities = HealthFacility.objects.filter(is_active=True).exclude(id=worker.facility_id)
    facility_snaps = [
        FacilitySnapshot(
            id=str(f.id), name=f.name, level=f.level,
            latitude=f.latitude, longitude=f.longitude,
            available_services=f.available_services or [],
            icu_beds_available=f.icu_beds_available,
            nicu_cots_available=f.nicu_cots_available,
            theatre_available=f.theatre_available,
            blood_bank=f.blood_bank,
            on_call_specialist=f.on_call_specialist,
            phone=f.phone or "",
        )
        for f in facilities
    ]
    engine = ReferralEngine()
    result = engine.suggest(case_snap, facility_snaps)
    if not result.recommendations:
        return None

    top = result.recommendations[0]
    receiving_facility = HealthFacility.objects.get(id=top.facility.id)

    referral = Referral.objects.create(
        emergency_case=case,
        referring_facility=worker.facility,
        receiving_facility=receiving_facility,
        engine_version=result.engine_version,
        engine_mode="rule_based",
        status="DRAFT",
        created_by=worker,
    )
    ReferralStatusLog.objects.create(
        referral=referral, from_status="", to_status="DRAFT",
        changed_by=worker, note="Referral created via inbound SMS.",
    )
    referral.status = "PENDING"
    referral.save(update_fields=["status", "updated_at"])
    ReferralStatusLog.objects.create(
        referral=referral, from_status="DRAFT", to_status="PENDING",
        changed_by=worker, note="Auto-submitted via SMS — awaiting facility acceptance.",
    )

    return {"facility_name": receiving_facility.name, "ref_id": str(referral.id)[:8].upper()}
