"""
ussd_service.py
----------------
USSD referral initiation for NeoMatCare — Africa's Talking USSD callback.

Item 5.2 of the offline-first plan: a *XXX# menu a health worker can dial
from ANY phone, smartphone or not, to trigger an emergency referral with a
handful of keypresses — zero app, zero data connectivity required at all.
USSD rides the same GSM signalling channel as voice calls, which reaches
much further than mobile data in the northern belt — this is the option
that works even for a health worker without a smartphone at all.

This is deliberately a MINIMAL referral: age + one danger sign + an
auto-routed facility (no manual facility choice, no full case details —
AT USSD sessions are short-lived and metered per screen, so brevity is a
real constraint, not just a UX nicety). The health worker fills in the
rest via the app once connectivity returns; this just gets the emergency
notification and a provisional referral moving immediately.

Place this file at the project root (next to sms_service.py and
referral_engine.py). Wire the URL in config/urls.py:
    path("ussd/", include("apps.referrals.ussd_urls"))
(a callback view module, apps/referrals/ussd_urls.py + ussd_views.py,
should point POST /ussd/ at handle_ussd_request below.)

No separate Africa's Talking USSD credentials are needed beyond the
existing AFRICASTALKING_USERNAME/AFRICASTALKING_API_KEY (USSD callbacks
are inbound webhooks AT calls on your registered shortcode — no outbound
API key required for this half; the SMS notification triggered at the end
of a successful session reuses sms_service.py's existing AT SMS setup).

Africa's Talking POSTs application/x-www-form-urlencoded with:
    sessionId, serviceCode, phoneNumber, text
`text` is the FULL history of the session's input, each screen's answer
joined by '*' (e.g. "34*1*1" = age 34, danger sign #1, confirmed).
The response must start with "CON " to keep the session open for another
screen, or "END " to terminate it — anything else is treated as a session
error by AT.
"""
import logging

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


def _menu_text() -> str:
    lines = ["Select main danger sign:"]
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
        return _handle(phone_number, text)
    except Exception:
        logger.exception("USSD handler error for session %s", session_id)
        return "END Something went wrong. Please try again or use the NeoMatCare app."


def _handle(phone_number: str, text: str) -> str:
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

    parts = text.split("*") if text else []

    # Screen 1 → 2: ask age
    if len(parts) == 0:
        return "CON NeoMatCare Emergency Referral\nEnter patient's age (years):"

    # Screen 2 → 3: ask danger sign
    if len(parts) == 1:
        age_raw = parts[0]
        if not age_raw.isdigit() or not (0 < int(age_raw) < 120):
            return "END Invalid age. Please dial again and enter a number between 1 and 119."
        return "CON " + _menu_text()

    # Screen 3 → 4: confirm
    if len(parts) == 2:
        age_raw, sign_choice = parts
        if not sign_choice.isdigit() or not (1 <= int(sign_choice) <= len(DANGER_SIGN_MENU)):
            return "END Invalid selection. Please dial again."
        _code, label = DANGER_SIGN_MENU[int(sign_choice) - 1]
        return (
            f"CON Confirm referral:\nAge {age_raw}, Sign: {label}\n"
            f"1. Confirm & Send\n2. Cancel"
        )

    # Screen 4: create (or cancel) — terminal screen either way
    if len(parts) == 3:
        age_raw, sign_choice, confirm = parts
        if confirm == "2":
            return "END Referral cancelled."
        if confirm != "1":
            return "END Invalid selection. Please dial again."
        if not age_raw.isdigit() or not sign_choice.isdigit():
            return "END Invalid session. Please dial again."

        _code, label = DANGER_SIGN_MENU[int(sign_choice) - 1]
        result = _create_ussd_referral(worker, int(age_raw), _code)
        if not result:
            return (
                "END Referral could not be routed automatically — no suitable "
                "facility was found. Please use the app or call your facility admin."
            )
        return (
            f"END Referral sent for Age {age_raw}, {label}.\n"
            f"Routed to: {result['facility_name']}\n"
            f"The facility has been notified by SMS. Ref: {result['ref_id']}\n"
            f"Please complete full case details in the app when possible."
        )

    return "END Session expired. Please dial again."


def _create_ussd_referral(worker, age: int, danger_sign_code: str) -> dict | None:
    """
    Creates a minimal Patient + EmergencyCase + Referral, auto-routed by
    the existing referral_engine scoring (same engine the app's "Make a
    Referral" step uses), then immediately transitions the referral
    DRAFT → PENDING. That transition is what apps/referrals/signals.py
    listens for to fire notify_referral_pending() (sms_service.py) — so
    the receiving facility's admins and the patient get the same SMS
    notification a normal in-app referral would trigger, without needing
    this session to touch the API at all.

    Returns None if no active facility could be routed to (e.g. every
    other facility is inactive) — the caller shows a plain-language
    fallback message rather than a stack trace.
    """
    from apps.cases.models import Patient, EmergencyCase
    from apps.facilities.models import HealthFacility
    from apps.referrals.models import Referral, ReferralStatusLog
    from referral_engine import ReferralEngine, CaseSnapshot, FacilitySnapshot

    patient = Patient.objects.create(
        patient_name="USSD Emergency Referral",
        age=age,
        patient_type="maternal",
        wellness_type="maternal",
    )
    case = EmergencyCase.objects.create(
        patient=patient,
        presenting_complaint="Referral initiated via USSD (offline channel) — full case details pending.",
        danger_signs=[danger_sign_code],
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

    return {"facility_name": receiving_facility.name, "ref_id": str(referral.id)[:8].upper()}
