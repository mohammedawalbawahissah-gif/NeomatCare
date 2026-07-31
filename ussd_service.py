"""
ussd_service.py
----------------
USSD referral initiation for NeoMatCare — Africa's Talking USSD callback.

Item 5.2 of the offline-first plan: a *XXX# menu a health worker can dial
from ANY phone, smartphone or not, to trigger a real, routed emergency
referral with a handful of keypresses — zero app, zero data connectivity
required at all. USSD rides the same GSM signalling channel as voice
calls, which reaches much further than mobile data in the northern belt.

Flow (each step is one USSD screen):
    0. Main menu: 1. Emergency Referral  2. Check Patient Status  3. Log
       Follow-Up Note. Items 2 and 3 are item (C) of the offline-first
       plan — routine, non-emergency actions for a health worker with no
       smartphone/no data, kept deliberately narrow (a read-only status
       summary, and appending a timestamped note) rather than full
       household management over a keypad; see apps/cases/followup_service.py
       and the README Roadmap for why. Both are single Hospital-ID lookups,
       no multi-screen state beyond that.
    1. Existing patient (Hospital ID lookup) or New patient?
    2a. Existing: enter Hospital ID -> found -> straight to danger signs
        (age/name already on file; not found -> session ends, try again)
    2b. New: enter age, then enter name
    3. Pick one or more danger signs (loop: "Add another?" until "0" = done)
    4. Engine routes a facility from the signs collected so far and shows
       it for CONFIRMATION before anything is written to the database —
       "1. Confirm & Send" creates Patient(if new)/EmergencyCase/Referral;
       "2. Cancel" ends the session with nothing created at all.

Nothing is written to the database until the final confirm step. This is
a deliberate change from the original single-danger-sign version, which
used to create a Patient+EmergencyCase eagerly on the first screen —
meaning every abandoned or cancelled session left an orphan record. Now
cancelling truly cancels.

SESSION STATE — why this needs Redis in production:
Africa's Talking re-sends the full session's answer history in `text` on
every request, joined by '*', but nothing about the PROTOCOL requires
those answers to be simple menu digits — this flow now includes a free-
text patient name and a free-text Hospital ID, either of which could
(rarely) contain a literal '*' and corrupt naive positional parsing.
Rather than re-derive state by re-splitting the accumulating `text` string
every time, this file keeps a small state dict in Django's cache, keyed by
Africa's Talking's sessionId (see ussd_session.py), and only ever reads
the NEW input appended since the last request (a plain string slice, not
a split — so a '*' inside a name can't misalign anything downstream).

This requires a SHARED cache (Redis) if you run more than one app server
process/worker — see config/settings/base.py's CACHES setting and the
comment there. With the default per-process LocMemCache and 2+ Gunicorn
workers, a session's later screens can land on a different worker than
the one that started it and silently lose its state. Set REDIS_URL in
production.

Place this file at the project root (next to sms_service.py and
referral_engine.py). Wired in config/urls.py:
    path("ussd/", include("apps.referrals.ussd_urls"))

No separate Africa's Talking USSD credentials are needed beyond the
existing AFRICASTALKING_USERNAME/AFRICASTALKING_API_KEY (USSD callbacks
are inbound webhooks AT calls on your registered shortcode — no outbound
API key required for this half; the SMS notification triggered at the end
of a successful session reuses sms_service.py's existing AT SMS setup).

Africa's Talking POSTs application/x-www-form-urlencoded with:
    sessionId, serviceCode, phoneNumber, text
The response must start with "CON " to keep the session open for another
screen, or "END " to terminate it — anything else is treated as a session
error by AT.
"""
import logging

from ussd_session import get_session, save_session, clear_session

logger = logging.getLogger(__name__)

# A curated short-list, not the full referral_engine.DangerSign set — kept
# to what's legible on a basic phone screen and covers the signs a health
# worker is most likely calling about. Values are real DangerSign codes so
# they plug straight into the existing referral engine's scoring.
DANGER_SIGN_MENU = [
    ("PPH", "Heavy bleeding"),
    ("ECLAMPSIA", "Convulsions / fits"),
    ("OBSTRUCTED_LABOUR", "Prolonged / obstructed labour"),
    ("APH", "Bleeding before birth"),
    ("SEVERE_PRE_ECLAMPSIA", "Severe headache / blurred vision"),
    ("NEONATAL_DISTRESS", "Baby in distress / not moving"),
]


def _sign_menu_text(prefix: str) -> str:
    lines = [prefix]
    for i, (_code, label) in enumerate(DANGER_SIGN_MENU, start=1):
        lines.append(f"{i}. {label}")
    return "\n".join(lines)


def handle_ussd_request(session_id: str, phone_number: str, text: str) -> str:
    """
    Entry point for the USSD callback view. Returns the full AT response
    string, already prefixed with CON/END. Never raises — any internal
    error ends the session gracefully rather than leaving the health
    worker's phone hanging on a broken session.
    """
    try:
        return _handle(session_id, phone_number, text)
    except Exception:
        logger.exception("USSD handler error for session %s", session_id)
        clear_session(session_id)
        return "END Something went wrong. Please try again or use the NeoMatCare app."


def _handle(session_id: str, phone_number: str, text: str) -> str:
    from apps.accounts.models import User

    worker = (
        User.objects.filter(
            phone_number=phone_number,
            role__in=("health_worker", "facility_admin"),
            is_active=True,
        )
        .select_related("facility")
        .first()
    )
    if not worker:
        return (
            "END This number is not registered as a NeoMatCare health worker. "
            "Please contact your facility admin, or use the app to register."
        )
    if not worker.facility_id:
        return "END Your account has no facility on file. Please contact your facility admin."

    # ── Fresh session ────────────────────────────────────────────────────
    if text == "":
        save_session(session_id, {"step": "main_menu", "prev_text": ""})
        return (
            "CON NeoMatCare\n"
            "1. Emergency Referral\n"
            "2. Check Patient Status\n"
            "3. Log Follow-Up Note"
        )

    state = get_session(session_id)
    if state is None:
        # Cache expired, server restarted mid-session, or a worker without
        # the shared cache lost it — safest thing is to ask them to redial
        # rather than guess at state from the raw text and risk creating
        # the wrong thing.
        return "END Session expired. Please dial again."

    prev_text = state.get("prev_text", "")
    if not text.startswith(prev_text):
        clear_session(session_id)
        return "END Session error. Please dial again."
    # Only the NEW input since the last screen — a plain slice, not a
    # re-split of the whole history, so a '*' inside a free-text answer
    # (name, Hospital ID) earlier in the session can't misalign this.
    new_input = text[len(prev_text):]
    if new_input.startswith("*"):
        new_input = new_input[1:]
    new_input = new_input.strip()

    step = state["step"]

    # ── Step: main menu ──────────────────────────────────────────────────
    if step == "main_menu":
        if new_input == "1":
            state["step"] = "path"
            state["signs"] = []
            state["prev_text"] = text
            save_session(session_id, state)
            return "CON NeoMatCare Emergency Referral\n1. Existing patient\n2. New patient"
        if new_input == "2":
            state["step"] = "status_hid"
            state["prev_text"] = text
            save_session(session_id, state)
            return "CON Enter the patient's Hospital ID:"
        if new_input == "3":
            state["step"] = "note_hid"
            state["prev_text"] = text
            save_session(session_id, state)
            return "CON Enter the patient's Hospital ID:"
        clear_session(session_id)
        return "END Invalid selection. Please dial again."

    # ── Step: check patient status (read-only, single lookup) ───────────
    if step == "status_hid":
        clear_session(session_id)
        from apps.cases.followup_service import check_patient_status
        summary = check_patient_status(new_input)
        if summary is None:
            return "END No patient found with that Hospital ID. Please check the ID and dial again."
        return f"END {summary}"

    # ── Step: log a follow-up note — Hospital ID, then the note text ────
    if step == "note_hid":
        from apps.cases.models import Patient
        patient = Patient.objects.filter(hospital_id__iexact=new_input).first()
        if not patient:
            clear_session(session_id)
            return "END No patient found with that Hospital ID. Please check the ID and dial again."
        state["patient_hid"] = new_input
        state["patient_name"] = patient.patient_name
        state["step"] = "note_text"
        state["prev_text"] = text
        save_session(session_id, state)
        return f"CON Enter your follow-up note for {patient.patient_name or 'this patient'}:"

    if step == "note_text":
        clear_session(session_id)
        if not new_input:
            return "END Invalid note. Please dial again."
        from apps.cases.followup_service import log_followup_note
        worker._followup_channel = "USSD"
        patient = log_followup_note(state["patient_hid"], worker, new_input)
        if not patient:
            return "END Could not save — the patient record was not found. Please dial again."
        return f"END Note saved for {patient.patient_name or 'this patient'}. Visible in the app now."

    # ── Step: existing vs new patient ───────────────────────────────────
    if step == "path":
        if new_input == "1":
            state["step"] = "hospital_id"
            state["prev_text"] = text
            save_session(session_id, state)
            return "CON Enter patient's Hospital ID:"
        if new_input == "2":
            state["step"] = "age"
            state["prev_text"] = text
            save_session(session_id, state)
            return "CON Enter patient's age (years):"
        clear_session(session_id)
        return "END Invalid selection. Please dial again."

    # ── Step: Hospital ID lookup (existing patient) ─────────────────────
    if step == "hospital_id":
        from apps.cases.models import Patient

        hid = new_input
        if not hid:
            clear_session(session_id)
            return "END Invalid Hospital ID. Please dial again."
        patient = Patient.objects.filter(hospital_id__iexact=hid).first()
        if not patient:
            clear_session(session_id)
            return (
                "END No patient found with that Hospital ID. Please check the ID and "
                "dial again, or select 'New patient' if this is their first visit."
            )
        state["patient_id"] = str(patient.id)
        state["patient_name"] = patient.patient_name
        state["age"] = patient.age
        state["step"] = "sign_select"
        state["prev_text"] = text
        save_session(session_id, state)
        return "CON " + _sign_menu_text(f"{patient.patient_name} found (age {patient.age}).\nSelect a danger sign:")

    # ── Step: age (new patient) ─────────────────────────────────────────
    if step == "age":
        if not new_input.isdigit() or not (0 < int(new_input) < 120):
            clear_session(session_id)
            return "END Invalid age. Please dial again and enter a number between 1 and 119."
        state["age"] = int(new_input)
        state["step"] = "name"
        state["prev_text"] = text
        save_session(session_id, state)
        return "CON Enter patient's name:"

    # ── Step: name (new patient) ────────────────────────────────────────
    if step == "name":
        if not new_input:
            clear_session(session_id)
            return "END Invalid name. Please dial again."
        state["patient_name"] = new_input[:200]  # matches Patient.patient_name max_length headroom
        state["step"] = "sign_select"
        state["prev_text"] = text
        save_session(session_id, state)
        return "CON " + _sign_menu_text("Select a danger sign:")

    # ── Step: danger sign selection loop ────────────────────────────────
    if step == "sign_select":
        if new_input == "0":
            if not state["signs"]:
                clear_session(session_id)
                return "END Select at least one danger sign before continuing. Please dial again."
            routed = _route_facility(worker, state["signs"])
            if not routed:
                clear_session(session_id)
                return (
                    "END Referral could not be routed automatically — no suitable "
                    "facility was found. Please use the app or call your facility admin."
                )
            state["facility_id"] = routed["facility_id"]
            state["facility_name"] = routed["facility_name"]
            state["step"] = "confirm"
            state["prev_text"] = text
            save_session(session_id, state)
            return f"CON Route to {routed['facility_name']}?\n1. Confirm & Send\n2. Cancel"

        if not new_input.isdigit() or not (1 <= int(new_input) <= len(DANGER_SIGN_MENU)):
            clear_session(session_id)
            return "END Invalid selection. Please dial again."
        code, label = DANGER_SIGN_MENU[int(new_input) - 1]
        if code not in state["signs"]:
            state["signs"].append(code)
        state["prev_text"] = text
        save_session(session_id, state)
        chosen = ", ".join(l for c, l in DANGER_SIGN_MENU if c in state["signs"])
        return "CON " + _sign_menu_text(f"Added. So far: {chosen}.\n0. Done — continue\nOr pick another sign:")

    # ── Step: confirm & create (or cancel) — terminal either way ────────
    if step == "confirm":
        clear_session(session_id)
        if new_input == "2":
            return "END Referral cancelled. Nothing was saved."
        if new_input != "1":
            return "END Invalid selection. Please dial again."

        result = _create_ussd_referral(worker, state)
        if not result:
            return (
                "END The recommended facility is no longer available. "
                "Please use the app or call your facility admin."
            )
        return (
            f"END Referral sent for {result['patient_name']}.\n"
            f"Routed to: {result['facility_name']}\n"
            f"The facility has been notified by SMS. Ref: {result['ref_id']}\n"
            f"Please complete full case details in the app when possible."
        )

    clear_session(session_id)
    return "END Session expired. Please dial again."


def _route_facility(worker, danger_signs: list) -> dict | None:
    """Preview-only routing — runs the real scoring engine against the
    signs collected so far, WITHOUT creating any database records, so a
    health worker can see and confirm (or reject) the destination before
    anything is written. Returns None if no facility scores above zero."""
    from apps.facilities.models import HealthFacility
    from referral_engine import ReferralEngine, CaseSnapshot, FacilitySnapshot

    case_snap = CaseSnapshot(
        id="preview",
        danger_signs=danger_signs,
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
    return {
        "facility_id": top.facility.id,
        "facility_name": top.facility.name,
        "engine_version": result.engine_version,
    }


def _create_ussd_referral(worker, state: dict) -> dict | None:
    """
    Creates (or reuses) the Patient, then a real EmergencyCase + Referral,
    routed to the facility already shown and confirmed in _route_facility()
    above, then immediately transitions the referral DRAFT -> PENDING.
    That transition is what apps/referrals/signals.py listens for to fire
    notify_referral_pending() (sms_service.py) — so the receiving
    facility's admins and the patient get the same SMS notification a
    normal in-app referral would trigger, without needing this session to
    touch the API at all.

    Re-validates the facility is still active at this point (a health
    worker could in principle sit on the confirm screen for a while) —
    returns None if it's no longer routable, rather than silently
    referring to a facility that pulled itself offline in the meantime.
    """
    from apps.cases.models import Patient, EmergencyCase
    from apps.facilities.models import HealthFacility
    from apps.referrals.models import Referral, ReferralStatusLog

    try:
        receiving_facility = HealthFacility.objects.get(id=state["facility_id"], is_active=True)
    except HealthFacility.DoesNotExist:
        return None

    if state.get("patient_id"):
        patient = Patient.objects.get(id=state["patient_id"])
        complaint = "Referral initiated via USSD (offline channel) for an existing patient — full case details pending."
    else:
        patient = Patient.objects.create(
            patient_name=state["patient_name"],
            age=state["age"],
            patient_type="maternal",
            wellness_type="maternal",
        )
        complaint = "Referral initiated via USSD (offline channel) for a new patient — full case details pending."

    case = EmergencyCase.objects.create(
        patient=patient,
        presenting_complaint=complaint,
        danger_signs=state["signs"],
        referring_facility=worker.facility,
        created_by=worker,
    )

    referral = Referral.objects.create(
        emergency_case=case,
        referring_facility=worker.facility,
        receiving_facility=receiving_facility,
        engine_version="1.0.0",
        engine_mode="rule_based",
        status="DRAFT",
        created_by=worker,
    )
    ReferralStatusLog.objects.create(
        referral=referral, from_status="", to_status="DRAFT",
        changed_by=worker, note="Referral created via USSD.",
    )
    referral.status = "PENDING"
    referral.save(update_fields=["status", "updated_at"])
    ReferralStatusLog.objects.create(
        referral=referral, from_status="DRAFT", to_status="PENDING",
        changed_by=worker, note="Auto-submitted via USSD — awaiting facility acceptance.",
    )

    return {
        "patient_name": patient.patient_name,
        "facility_name": receiving_facility.name,
        "ref_id": str(referral.id)[:8].upper(),
    }
