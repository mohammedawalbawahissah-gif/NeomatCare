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

    worker = (
        User.objects.filter(
            phone_number=sender_phone,
            role__in=("health_worker", "facility_admin"),
            is_active=True,
        )
        .select_related("facility")
        .first()
    )
    if not worker:
        logger.warning("SMS referral attempt from unregistered number %s", sender_phone)
        return {"status": "unregistered", "detail": "Sender phone number is not a registered health worker."}

    if not worker.facility_id:
        return {"status": "no_facility", "detail": "Sender has no facility on file."}

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
