"""
apps/notifications/models.py
-----------------------------
General-purpose in-app notification feed, separate from
apps.referrals.models.Notification (which only tracks outbound
SMS/push delivery status for a single referral).

Every Notification row here represents something a specific user
should see in their bell dropdown. Delivery over email/SMS is
attempted in addition to the in-app row — see services.py.
"""
import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone


class NotificationType(models.TextChoices):
    REFERRAL_NEW         = "referral_new",         "New Referral"
    REFERRAL_STATUS      = "referral_status",      "Referral Status Update"
    CASE_NEW             = "case_new",             "New Emergency Case"
    PATIENT_HIGH_RISK    = "patient_high_risk",    "Patient Flagged High Risk"
    CONSULTATION_NEW     = "consultation_new",     "New Consultation Request"
    CONSULTATION_STATUS  = "consultation_status",  "Consultation Status Update"
    CONSULTATION_MESSAGE = "consultation_message", "New Consultation Message"
    TRANSPORT_NEW        = "transport_new",        "New Transport Request"
    TRANSPORT_STATUS     = "transport_status",     "Transport Status Update"
    CAPACITY_UPDATED     = "capacity_updated",     "Facility Capacity Updated"
    REVIEW_NEW           = "review_new",           "New Patient Review"
    ANC_VISIT_LOGGED     = "anc_visit_logged",     "ANC Visit Logged"
    CONSENT_RECORDED     = "consent_recorded",     "Consent Recorded"


class Notification(models.Model):
    id        = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    notif_type = models.CharField(max_length=30, choices=NotificationType.choices)
    title      = models.CharField(max_length=200)
    message    = models.TextField(blank=True)
    # Frontend route to navigate to when the notification is clicked,
    # e.g. "/app/referrals/<uuid>"
    url = models.CharField(max_length=255, blank=True)

    # Loose reference back to the triggering object — not a real FK
    # since it can point at rows in several different apps.
    related_app = models.CharField(max_length=50, blank=True)
    related_id  = models.CharField(max_length=64, blank=True)

    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    email_sent = models.BooleanField(default=False)
    sms_sent   = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notifications_notification"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["recipient", "is_read", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.notif_type} -> {self.recipient.email}"

    def mark_read(self):
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save(update_fields=["is_read", "read_at"])
