"""
apps/notifications/services.py
--------------------------------
notify() / notify_many() are the only entry points other apps should
call. They create the in-app Notification row *synchronously* (fast,
DB-only), then hand email + SMS delivery off to a background thread.

This matters because neither delivery channel had a bounded timeout:
Django's SMTP backend blocks forever without EMAIL_TIMEOUT set, and the
africastalking SDK doesn't expose a timeout in its send() call either.
Both used to run inline inside notify(), which itself runs inline
inside the post_save signal that fires from perform_create() — meaning
a slow/hanging SMTP or SMS gateway blocked the entire HTTP request that
triggered it (creating a referral, transport request, or consultation)
until the gunicorn worker timeout killed it. To the browser, a killed
connection with no response looks identical to a CORS rejection, which
is why this surfaced as "blocked by CORS policy" rather than a timeout.

Moving delivery to a background thread means notify() returns — and so
does the HTTP response — as soon as the in-app row is created, no
matter how long the notification provider takes. Delivery failures
(including timeouts) are logged and flagged on the row after the fact;
they never raise into, or block, the caller.
"""
import logging
import socket
import threading
from contextlib import contextmanager

from django.conf import settings
from django.core.mail import send_mail

from .models import Notification

logger = logging.getLogger(__name__)

# Ceiling on any single outbound call made from a delivery thread. This
# uses socket.setdefaulttimeout(), which is process-global rather than
# thread-scoped — under gunicorn's sync workers there's a brief window
# where a concurrent request's own socket operations (DB, outbound HTTP)
# could pick up this same timeout. A 10s ceiling is a reasonable default
# for those regardless, so that's an acceptable trade-off versus the
# previous behavior of no timeout at all, and it's confined to the short
# window while a delivery thread is actually running.
_DELIVERY_SOCKET_TIMEOUT_SECONDS = 10


@contextmanager
def _bounded_socket_timeout():
    previous = socket.getdefaulttimeout()
    socket.setdefaulttimeout(_DELIVERY_SOCKET_TIMEOUT_SECONDS)
    try:
        yield
    finally:
        socket.setdefaulttimeout(previous)


def _send_email(user, title, message):
    if not getattr(user, "email", None):
        return False
    try:
        with _bounded_socket_timeout():
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
        with _bounded_socket_timeout():
            africastalking.initialize(settings.AT_USERNAME, api_key)
            sms = africastalking.SMS
            sms.send(message, [phone])
        return True
    except Exception:
        logger.exception("Failed to send notification SMS to %s", phone)
        return False


def _deliver_in_background(notification_id, user, title, message):
    """Runs off the request thread — there's no request context left by
    the time this executes, so nothing here may raise back into a caller."""
    try:
        email_ok = _send_email(user, title, message)
        sms_ok = _send_sms(user, message)
        if email_ok or sms_ok:
            Notification.objects.filter(pk=notification_id).update(
                email_sent=email_ok, sms_sent=sms_ok,
            )
    except Exception:
        logger.exception(
            "Notification delivery thread failed for notification %s", notification_id
        )


def notify(user, notif_type, title, message, url="", related_app="", related_id=""):
    """Create one notification for `user` and attempt email + SMS delivery
    — except for patients, who get in-app only. The patient portal has its
    own real-time AI assistant surface; patients don't need a parallel
    SMS/email channel for the same events, and it keeps their notification
    behavior distinct from the operational (staff/driver) side of the app.

    Returns as soon as the in-app Notification row is created — email/SMS
    delivery happens on a background thread and never blocks the caller."""
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

    threading.Thread(
        target=_deliver_in_background,
        args=(notification.pk, user, title, message),
        daemon=True,
    ).start()

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

