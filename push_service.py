"""
push_service.py
---------------
Expo push notification service for NeoMatCare.

Place at project root alongside sms_service.py.

How it works:
  1. Mobile app registers its Expo push token via POST /api/auth/push-token/
  2. Token is stored on User.expo_push_token
  3. This service reads that token and calls Expo's push API

Install:
    pipenv install requests   (already installed via DRF — but ensure it's present)

Expo push API docs: https://docs.expo.dev/push-notifications/sending-notifications/
"""
import logging
import requests

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


# ═════════════════════════════════════════════════════════════════════════
# LOW-LEVEL SENDER
# ═════════════════════════════════════════════════════════════════════════

def send_push(token: str, title: str, body: str, data: dict = None) -> bool:
    """
    Send a single Expo push notification.

    Returns True on success, False on any failure.
    Token must be an ExponentPushToken[xxxx] string.
    """
    if not token or not token.startswith("ExponentPushToken"):
        logger.warning("send_push: invalid or missing token '%s' — skipping", token)
        return False

    payload = {
        "to":    token,
        "title": title,
        "body":  body,
        "sound": "default",
        "data":  data or {},
    }

    try:
        response = requests.post(
            EXPO_PUSH_URL,
            json=payload,
            headers={
                "Accept":       "application/json",
                "Content-Type": "application/json",
            },
            timeout=10,
        )
        result = response.json()
        ticket = result.get("data", {})
        if ticket.get("status") == "ok":
            logger.info("Push sent → %s", token[:30])
            return True
        logger.error("Push failed → %s | %s", token[:30], ticket.get("message"))
        return False
    except Exception:
        logger.exception("Push exception for token %s", token[:30])
        return False


def send_push_to_user(user, title: str, body: str, data: dict = None) -> bool:
    """Send a push notification to a single user via their stored token."""
    token = getattr(user, "expo_push_token", "") or ""
    if not token:
        logger.info("User %s has no expo_push_token — skipping push", user.email)
        return False
    return send_push(token, title, body, data)


# ═════════════════════════════════════════════════════════════════════════
# HIGH-LEVEL TRIGGER FUNCTIONS
# Mirror the sms_service.py trigger functions exactly.
# Called by signals alongside SMS — both fire on the same events.
# ═════════════════════════════════════════════════════════════════════════

def push_referral_pending(referral) -> None:
    """
    Referral → PENDING
    → Push to all facility admins at receiving facility.
    → Push to patient's health worker (created_by).
    """
    from apps.accounts.models import User, Role

    case    = referral.emergency_case
    patient = case.patient
    signs   = ", ".join(case.danger_signs) if case.danger_signs else "unspecified"
    ref_id  = str(referral.id)[:8].upper()

    # Facility admins
    admins = User.objects.filter(
        facility=referral.receiving_facility,
        role=Role.FACILITY_ADMIN,
        is_active=True,
    )
    for admin in admins:
        send_push_to_user(
            admin,
            title="🚨 Incoming Referral",
            body=f"{patient.patient_name or 'Patient'}, age {patient.age} — {signs}",
            data={"type": "referral_pending", "referral_id": str(referral.id)},
        )


def push_referral_accepted(referral) -> None:
    """Referral → ACCEPTED → Push to health worker who created it."""
    ref_id = str(referral.id)[:8].upper()
    send_push_to_user(
        referral.created_by,
        title="✅ Referral Accepted",
        body=f"{referral.receiving_facility.name} is ready to receive your patient.",
        data={"type": "referral_accepted", "referral_id": str(referral.id)},
    )


def push_referral_cancelled(referral) -> None:
    """Referral → CANCELLED → Push to health worker who created it."""
    send_push_to_user(
        referral.created_by,
        title="❌ Referral Declined",
        body=f"{referral.receiving_facility.name} could not accept this referral. Please refer elsewhere.",
        data={"type": "referral_cancelled", "referral_id": str(referral.id)},
    )


def push_consultation_requested(consultation) -> None:
    """New Consultation → Push to assigned specialist."""
    if not consultation.specialist:
        return
    case  = consultation.emergency_case
    signs = ", ".join(case.danger_signs) if case.danger_signs else "unspecified"
    send_push_to_user(
        consultation.specialist.user,
        title="📋 Consultation Request",
        body=f"Patient age {case.patient.age} — {signs}. Tap to respond.",
        data={"type": "consultation_requested", "consultation_id": str(consultation.id)},
    )


def push_consultation_accepted(consultation) -> None:
    """Consultation → ACCEPTED → Push to requesting health worker."""
    if not consultation.requested_by:
        return
    specialist_name = (
        f"Dr. {consultation.specialist.user.name}"
        if consultation.specialist else "The specialist"
    )
    send_push_to_user(
        consultation.requested_by,
        title="✅ Consultation Accepted",
        body=f"{specialist_name} has accepted your request. Log in to begin.",
        data={"type": "consultation_accepted", "consultation_id": str(consultation.id)},
    )


def push_consultation_declined(consultation) -> None:
    """Consultation → DECLINED → Push to requesting health worker."""
    if not consultation.requested_by:
        return
    send_push_to_user(
        consultation.requested_by,
        title="❌ Consultation Declined",
        body="The specialist could not accept your request. Please try another specialist.",
        data={"type": "consultation_declined", "consultation_id": str(consultation.id)},
    )
