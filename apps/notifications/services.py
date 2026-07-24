"""
apps/notifications/services.py
--------------------------------
notify() / notify_many() are the only entry points other apps should
call. They create the in-app Notification row, then best-effort
deliver the same content over email and SMS. Delivery failures are
logged and flagged on the row — they never raise, and never block
creation of the in-app notification itself. An emergency referral
system should never lose the in-app alert because an SMS gateway
timed out.
"""
import logging

from django.conf import settings
from django.core.mail import send_mail

from .models import Notification

logger = logging.getLogger(__name__)


def _send_email(user, title, message):
    if not getattr(user, "email", None):
        return False
    try:
        send_mail(
            subject=f"[NeoMatCare] {title}",
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=True,
        )
        return True
    except Exception:
        logger.exception("Failed to send notification email to %s", user.email)
        return False


def _send_sms(user, message):
    phone = getattr(user, "phone_number", "") or ""
    if not phone:
        return False
    api_key = getattr(settings, "AT_API_KEY", "")
    if not api_key:
        # Not configured (e.g. local dev) — skip quietly rather than error.
        return False
    try:
        import africastalking
        africastalking.initialize(settings.AT_USERNAME, api_key)
        sms = africastalking.SMS
        sms.send(message, [phone])
        return True
    except Exception:
        logger.exception("Failed to send notification SMS to %s", phone)
        return False


def notify(user, notif_type, title, message, url="", related_app="", related_id=""):
    """Create one notification for `user` and attempt email + SMS delivery
    — except for patients, who get in-app only. The patient portal has its
    own real-time AI assistant surface; patients don't need a parallel
    SMS/email channel for the same events, and it keeps their notification
    behavior distinct from the operational (staff/driver) side of the app."""
    if user is None:
        return None

    notification = Notification.objects.create(
        recipient=user,
        notif_type=notif_type,
        title=title,
        message=message,
        url=url,
        related_app=related_app,
        related_id=str(related_id) if related_id else "",
    )

    if getattr(user, "role", None) == "patient":
        return notification

    email_ok = _send_email(user, title, message)
    sms_ok = _send_sms(user, message)

    if email_ok or sms_ok:
        notification.email_sent = email_ok
        notification.sms_sent = sms_ok
        notification.save(update_fields=["email_sent", "sms_sent"])

    return notification


def notify_many(users, notif_type, title, message, url="", related_app="", related_id=""):
    """Same as notify(), for an iterable of users. De-duplicates automatically."""
    seen = set()
    results = []
    for user in users:
        if user is None or user.pk in seen:
            continue
        seen.add(user.pk)
        results.append(
            notify(user, notif_type, title, message, url, related_app, related_id)
        )
    return results
