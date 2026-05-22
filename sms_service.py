"""
sms_service.py
--------------
Africa's Talking SMS integration for NeoMatCare / Maternal Referral.

Place this file at the project root (next to referral_engine.py).

Environment variables (add to .env):
    AT_USERNAME=sandbox          # always 'sandbox' for testing
    AT_API_KEY=your_key_here     # AT dashboard → Settings → API Key

Install:
    pipenv install africastalking
"""

import os
import logging

import africastalking
from django.utils import timezone

logger = logging.getLogger(__name__)

# ── Initialise AT SDK once at import time ────────────────────────────────
africastalking.initialize(
    username=os.environ.get("AT_USERNAME", "sandbox"),
    api_key=os.environ.get("AT_API_KEY", ""),
)
_sms = africastalking.SMS


# ═════════════════════════════════════════════════════════════════════════
# LOW-LEVEL SENDER
# ═════════════════════════════════════════════════════════════════════════

def send_sms(phone: str, message: str) -> bool:
    """
    Send a single SMS via Africa's Talking.

    Returns True on success, False on any failure.
    All exceptions are caught and logged — callers never need try/except.

    Phone numbers must be in E.164 format, e.g. +233201234567.
    """
    if not phone or not phone.strip():
        logger.warning("send_sms: empty phone number — skipping")
        return False

    try:
        response = _sms.send(message, [phone])
        recipients = response.get("SMSMessageData", {}).get("Recipients", [])
        if recipients and recipients[0].get("status") == "Success":
            logger.info("SMS sent → %s", phone)
            return True
        logger.error("SMS failed → %s | response: %s", phone, response)
        return False
    except Exception:
        logger.exception("SMS exception for %s", phone)
        return False


# ═════════════════════════════════════════════════════════════════════════
# MESSAGE TEMPLATES
# ═════════════════════════════════════════════════════════════════════════
# Each function receives the model instance and returns a plain-text string.
# Keep messages under 160 chars where possible (1 SMS unit).
# ═════════════════════════════════════════════════════════════════════════

# ── Referral templates ────────────────────────────────────────────────────

def _msg_referral_pending_to_facility_admin(referral) -> str:
    case    = referral.emergency_case
    patient = case.patient
    signs   = ", ".join(case.danger_signs) if case.danger_signs else "not specified"
    ref_id  = str(referral.id)[:8].upper()
    return (
        f"[NeoMatCare] INCOMING REFERRAL\n"
        f"Patient: {patient.patient_name or 'Anonymous'}, Age {patient.age}\n"
        f"From: {referral.referring_facility.name}\n"
        f"Signs: {signs}\n"
        f"Ref: {ref_id}\n"
        f"Log in to accept or review."
    )


def _msg_referral_pending_to_patient(referral) -> str:
    ref_id = str(referral.id)[:8].upper()
    return (
        f"[NeoMatCare] You have been referred to "
        f"{referral.receiving_facility.name} for emergency care. "
        f"Follow your health worker's instructions. Ref: {ref_id}"
    )


def _msg_referral_accepted_to_worker(referral) -> str:
    ref_id = str(referral.id)[:8].upper()
    return (
        f"[NeoMatCare] REFERRAL ACCEPTED\n"
        f"{referral.receiving_facility.name} is ready to receive your patient.\n"
        f"Ref: {ref_id} — proceed with transport now."
    )


def _msg_referral_accepted_to_patient(referral) -> str:
    ref_id = str(referral.id)[:8].upper()
    return (
        f"[NeoMatCare] {referral.receiving_facility.name} is ready for you. "
        f"Please make your way there now. Ref: {ref_id}"
    )


def _msg_referral_cancelled_to_worker(referral) -> str:
    ref_id = str(referral.id)[:8].upper()
    return (
        f"[NeoMatCare] REFERRAL DECLINED\n"
        f"{referral.receiving_facility.name} could not accept this referral.\n"
        f"Ref: {ref_id} — please refer to an alternative facility."
    )


def _msg_referral_cancelled_to_patient(referral) -> str:
    ref_id = str(referral.id)[:8].upper()
    return (
        f"[NeoMatCare] Your referral to {referral.receiving_facility.name} "
        f"could not proceed. Your health worker will contact you shortly. "
        f"Ref: {ref_id}"
    )


# ── Consultation templates ────────────────────────────────────────────────

def _msg_consultation_requested_to_specialist(consultation) -> str:
    case    = consultation.emergency_case
    patient = case.patient
    signs   = ", ".join(case.danger_signs) if case.danger_signs else "not specified"
    worker  = consultation.requested_by.name if consultation.requested_by else "A health worker"
    con_id  = str(consultation.id)[:8].upper()
    return (
        f"[NeoMatCare] CONSULTATION REQUEST\n"
        f"From: {worker}\n"
        f"Patient: Age {patient.age} | Signs: {signs}\n"
        f"Channel: {consultation.get_channel_display()}\n"
        f"ID: {con_id} — log in to respond."
    )


def _msg_consultation_accepted_to_worker(consultation) -> str:
    specialist_name = (
        f"Dr. {consultation.specialist.user.name}"
        if consultation.specialist else "The specialist"
    )
    con_id = str(consultation.id)[:8].upper()
    return (
        f"[NeoMatCare] CONSULTATION ACCEPTED\n"
        f"{specialist_name} has accepted your request.\n"
        f"Channel: {consultation.get_channel_display()}\n"
        f"ID: {con_id} — log in to begin."
    )


def _msg_consultation_declined_to_worker(consultation) -> str:
    specialist_name = (
        f"Dr. {consultation.specialist.user.name}"
        if consultation.specialist else "The specialist"
    )
    con_id = str(consultation.id)[:8].upper()
    return (
        f"[NeoMatCare] CONSULTATION DECLINED\n"
        f"{specialist_name} could not accept your request.\n"
        f"ID: {con_id} — please request another available specialist."
    )


def _msg_consultation_reminder_to_specialist(consultation) -> str:
    case   = consultation.emergency_case
    signs  = ", ".join(case.danger_signs) if case.danger_signs else "not specified"
    con_id = str(consultation.id)[:8].upper()
    return (
        f"[NeoMatCare] REMINDER: Consultation {con_id} is still pending your response.\n"
        f"Patient signs: {signs}\n"
        f"Please log in to accept or decline."
    )


def _msg_consultation_reminder_to_worker(consultation) -> str:
    con_id = str(consultation.id)[:8].upper()
    return (
        f"[NeoMatCare] REMINDER: Your consultation request {con_id} is awaiting "
        f"a specialist response. Log in to check status or request another specialist."
    )


# ═════════════════════════════════════════════════════════════════════════
# HIGH-LEVEL TRIGGER FUNCTIONS
# Called by signals — each function handles recipient lookup and logging.
# ═════════════════════════════════════════════════════════════════════════

def notify_referral_pending(referral) -> None:
    """
    Referral moved to PENDING.
    → SMS to all active facility admins at the receiving facility.
    → SMS to patient.
    """
    from apps.accounts.models import User, Role
    from apps.referrals.models import Notification

    # 1. Receiving facility admins
    admins = User.objects.filter(
        facility=referral.receiving_facility,
        role=Role.FACILITY_ADMIN,
        is_active=True,
    )
    for admin in admins:
        phone = getattr(admin, "phone_number", "")
        if not phone:
            logger.warning(
                "Facility admin %s has no phone_number — skipping SMS", admin.email
            )
            continue
        success = send_sms(phone, _msg_referral_pending_to_facility_admin(referral))
        Notification.objects.create(
            referral=referral,
            channel=Notification.Channel.SMS,
            status=(
                Notification.NotificationStatus.SENT
                if success
                else Notification.NotificationStatus.FAILED
            ),
            sent_at=timezone.now() if success else None,
        )

    # 2. Patient
    patient_phone = referral.emergency_case.patient.patient_phone_number
    if patient_phone:
        send_sms(patient_phone, _msg_referral_pending_to_patient(referral))
    else:
        logger.info("Patient has no phone number — skipping patient SMS for referral %s", referral.id)


def notify_referral_accepted(referral) -> None:
    """
    Referral moved to ACCEPTED.
    → SMS to health worker who created the referral.
    → SMS to patient.
    """
    # 1. Health worker
    worker_phone = getattr(referral.created_by, "phone_number", "")
    if worker_phone:
        send_sms(worker_phone, _msg_referral_accepted_to_worker(referral))
    else:
        logger.warning(
            "Health worker %s has no phone_number — skipping SMS", referral.created_by.email
        )

    # 2. Patient
    patient_phone = referral.emergency_case.patient.patient_phone_number
    if patient_phone:
        send_sms(patient_phone, _msg_referral_accepted_to_patient(referral))


def notify_referral_cancelled(referral) -> None:
    """
    Referral moved to CANCELLED.
    → SMS to health worker who created the referral.
    → SMS to patient.
    """
    # 1. Health worker
    worker_phone = getattr(referral.created_by, "phone_number", "")
    if worker_phone:
        send_sms(worker_phone, _msg_referral_cancelled_to_worker(referral))
    else:
        logger.warning(
            "Health worker %s has no phone_number — skipping SMS", referral.created_by.email
        )

    # 2. Patient
    patient_phone = referral.emergency_case.patient.patient_phone_number
    if patient_phone:
        send_sms(patient_phone, _msg_referral_cancelled_to_patient(referral))


def notify_consultation_requested(consultation) -> None:
    """
    New Consultation created.
    → SMS to the assigned specialist.
    """
    if not consultation.specialist:
        logger.info("Consultation %s has no specialist assigned yet — skipping SMS", consultation.id)
        return
    phone = consultation.specialist.specialist_phone
    if phone:
        send_sms(phone, _msg_consultation_requested_to_specialist(consultation))
    else:
        logger.warning(
            "Specialist %s has no specialist_phone — skipping SMS",
            consultation.specialist.user.email,
        )


def notify_consultation_accepted(consultation) -> None:
    """
    Consultation moved to ACCEPTED.
    → SMS to the requesting health worker.
    """
    if not consultation.requested_by:
        return
    phone = getattr(consultation.requested_by, "phone_number", "")
    if phone:
        send_sms(phone, _msg_consultation_accepted_to_worker(consultation))
    else:
        logger.warning(
            "Requesting worker %s has no phone_number — skipping SMS",
            consultation.requested_by.email,
        )


def notify_consultation_declined(consultation) -> None:
    """
    Consultation moved to DECLINED.
    → SMS to the requesting health worker.
    """
    if not consultation.requested_by:
        return
    phone = getattr(consultation.requested_by, "phone_number", "")
    if phone:
        send_sms(phone, _msg_consultation_declined_to_worker(consultation))
    else:
        logger.warning(
            "Requesting worker %s has no phone_number — skipping SMS",
            consultation.requested_by.email,
        )


def send_consultation_reminders(stale_minutes: int = 15) -> int:
    """
    Send reminders for consultations that have been REQUESTED but not
    responded to within `stale_minutes`. Returns the count of reminders sent.

    Called by the management command: send_consultation_reminders.
    """
    from django.utils import timezone
    from datetime import timedelta
    from apps.consultations.models import Consultation, ConsultationStatus

    cutoff = timezone.now() - timedelta(minutes=stale_minutes)
    stale = Consultation.objects.filter(
        status=ConsultationStatus.REQUESTED,
        requested_at__lte=cutoff,
    ).select_related("specialist__user", "requested_by", "emergency_case__patient")

    count = 0
    for consultation in stale:
        # Remind specialist
        if consultation.specialist and consultation.specialist.specialist_phone:
            send_sms(
                consultation.specialist.specialist_phone,
                _msg_consultation_reminder_to_specialist(consultation),
            )
            count += 1

        # Remind requesting worker
        worker_phone = getattr(consultation.requested_by, "phone_number", "")
        if worker_phone:
            send_sms(worker_phone, _msg_consultation_reminder_to_worker(consultation))
            count += 1

    logger.info("Sent %d consultation reminder SMS(es)", count)
    return count
