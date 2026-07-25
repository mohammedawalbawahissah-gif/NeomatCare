"""
apps/notifications/services.py
--------------------------------
notify() / notify_many() are the only entry points other apps should
call. They create the in-app Notification row synchronously (fast,
DB-only), then best-effort deliver the same content over email and
SMS. Delivery failures are logged and flagged on the row — they
never raise, and never block creation of the in-app notification
itself. An emergency referral system should never lose the in-app
alert because an SMS gateway timed out.

Email/SMS delivery is dispatched to a small background thread pool
and scheduled via transaction.on_commit(), NOT run inline in the
request/response cycle. This used to run synchronously here, and it
was a real bug, not just a slow path: a single high-risk case or
referral fans out to every relevant facility admin (and, for
high-risk danger signs, every superadmin), and each recipient meant
a blocking SMTP call plus a blocking Africa's Talking HTTP call with
no timeout configured on either. On a case with several recipients,
that easily exceeded the frontend's 60s axios timeout even while
comfortably inside gunicorn's 120s worker timeout — so the browser
saw no response at all (indistinguishable from a dropped connection)
while the case was in fact still being created server-side. The
frontend's offline queue correctly queues anything that looks like a
network error, which meant a real case/referral creation on a
perfectly good connection could get misfiled as "saved offline" and
then retried, risking a duplicate record. Moving delivery off the
request thread removes the coupling that caused this.
"""
import logging
from concurrent.futures import ThreadPoolExecutor

from django.conf import settings
from django.core.mail import send_mail
from django.db import close_old_connections, transaction

from .models import Notification

logger = logging.getLogger(__name__)

# Small bounded pool for best-effort email/SMS delivery. Bounded so a large
# recipient fan-out (e.g. a high-risk case notifying every superadmin) can't
# spawn an unbounded number of threads — deliveries simply queue up behind
# the pool instead, still off the request thread.
_delivery_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="notify-delivery")


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


def _deliver_in_background(notification_id, user, title, message):
    """Runs on a delivery-pool thread, never on the request thread. Opens its
    own DB connection (Django gives each thread its own) and closes it when
    done so the pool doesn't accumulate idle connections between calls."""
    try:
        email_ok = _send_email(user, title, message)
        sms_ok = _send_sms(user, message)
        if email_ok or sms_ok:
            Notification.objects.filter(id=notification_id).update(
                email_sent=email_ok, sms_sent=sms_ok
            )
    except Exception:
        logger.exception("Background notification delivery failed for user %s", getattr(user, "pk", None))
    finally:
        close_old_connections()


def notify(user, notif_type, title, message, url="", related_app="", related_id=""):
    """Create one notification for `user` and schedule best-effort email + SMS
    delivery — except for patients, who get in-app only. The patient portal
    has its own real-time AI assistant surface; patients don't need a
    parallel SMS/email channel for the same events, and it keeps their
    notification behavior distinct from the operational (staff/driver) side
    of the app.

    The in-app Notification row is created synchronously (cheap, DB-only) so
    it's guaranteed to exist by the time this function returns. Email/SMS
    delivery is scheduled to run on a background thread only after the
    current transaction commits — never inline — so a slow SMTP/SMS provider
    can never add latency to the case/referral creation request itself."""
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

    notification_id = notification.id
    transaction.on_commit(
        lambda: _delivery_executor.submit(
            _deliver_in_background, notification_id, user, title, message
        )
    )

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
