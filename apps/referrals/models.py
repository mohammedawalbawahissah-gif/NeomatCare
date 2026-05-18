"""
apps/referrals/models.py
-------------------------
Models:
  Referral          — full referral lifecycle with state machine
  ReferralStatusLog — immutable audit trail of every state transition
  Notification      — tracks SMS/push alerts sent to receiving facilities

State machine:
  DRAFT → PENDING → ACCEPTED → IN_TRANSIT → RECEIVED → COMPLETED
                  ↘ CANCELLED              ↘ FAILED
"""
import uuid
from django.db import models
from django.utils import timezone


class ReferralStatus(models.TextChoices):
    DRAFT      = "DRAFT",      "Draft"
    PENDING    = "PENDING",    "Pending"
    ACCEPTED   = "ACCEPTED",   "Accepted"
    IN_TRANSIT = "IN_TRANSIT", "In Transit"
    RECEIVED   = "RECEIVED",   "Received"
    COMPLETED  = "COMPLETED",  "Completed"
    CANCELLED  = "CANCELLED",  "Cancelled"
    FAILED     = "FAILED",     "Failed"


# Valid transitions — enforced in the status update view
VALID_TRANSITIONS: dict[str, list[str]] = {
    ReferralStatus.DRAFT:      [ReferralStatus.PENDING,    ReferralStatus.CANCELLED],
    ReferralStatus.PENDING:    [ReferralStatus.ACCEPTED,   ReferralStatus.CANCELLED],
    ReferralStatus.ACCEPTED:   [ReferralStatus.IN_TRANSIT, ReferralStatus.CANCELLED],
    ReferralStatus.IN_TRANSIT: [ReferralStatus.RECEIVED,   ReferralStatus.FAILED],
    ReferralStatus.RECEIVED:   [ReferralStatus.COMPLETED],
    ReferralStatus.COMPLETED:  [],
    ReferralStatus.CANCELLED:  [],
    ReferralStatus.FAILED:     [],
}

TERMINAL_STATUSES = {
    ReferralStatus.COMPLETED,
    ReferralStatus.CANCELLED,
    ReferralStatus.FAILED,
}


class MaternalOutcome(models.TextChoices):
    SURVIVED = "survived", "Survived"
    DIED     = "died",     "Died"
    UNKNOWN  = "unknown",  "Unknown"


class NeonatalOutcome(models.TextChoices):
    SURVIVED = "survived", "Survived"
    DIED     = "died",     "Died"
    UNKNOWN  = "unknown",  "Unknown"


class Referral(models.Model):
    """
    Represents a single patient referral from one facility to another.

    engine_recommendation — the facility the engine suggested (may differ
                            from receiving_facility if the clinician overrides).
    override_reason       — required when the clinician ignores the engine.
    engine_version        — version string of the rule set that generated the
                            suggestion; stored for reproducibility and audit.
    """
    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    emergency_case = models.OneToOneField(
        "cases.EmergencyCase",
        on_delete=models.PROTECT,
        related_name="referral",
    )
    referring_facility = models.ForeignKey(
        "facilities.HealthFacility",
        on_delete=models.PROTECT,
        related_name="outgoing_referrals",
    )
    receiving_facility = models.ForeignKey(
        "facilities.HealthFacility",
        on_delete=models.PROTECT,
        related_name="incoming_referrals",
    )

    # ── Engine tracking ───────────────────────────────────────────────────
    engine_recommendation = models.ForeignKey(
        "facilities.HealthFacility",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="engine_recommended_referrals",
        help_text="The facility the engine ranked #1 for this case.",
    )
    engine_version  = models.CharField(max_length=20, blank=True)
    override_reason = models.TextField(
        blank=True,
        help_text="Required when the clinician selects a different facility than the engine suggested.",
    )

    # ── Status ────────────────────────────────────────────────────────────
    status = models.CharField(
        max_length=12,
        choices=ReferralStatus.choices,
        default=ReferralStatus.DRAFT,
    )

    # ── Outcome ───────────────────────────────────────────────────────────
    maternal_outcome = models.CharField(
        max_length=10,
        choices=MaternalOutcome.choices,
        default=MaternalOutcome.UNKNOWN,
    )
    neonatal_outcome = models.CharField(
        max_length=10,
        choices=NeonatalOutcome.choices,
        default=NeonatalOutcome.UNKNOWN,
    )
    outcome_notes = models.TextField(blank=True)

    # ── Meta ──────────────────────────────────────────────────────────────
    created_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.PROTECT,
        related_name="created_referrals",
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "referral"

    def __str__(self):
        return f"Referral {self.id} [{self.status}]"

    @property
    def is_terminal(self) -> bool:
        return self.status in TERMINAL_STATUSES

    def get_valid_next_statuses(self) -> list[str]:
        return VALID_TRANSITIONS.get(self.status, [])


class ReferralStatusLog(models.Model):
    """
    Immutable audit log of every state transition on a Referral.
    Used by GET /api/referrals/{id}/timeline/ and clinical auditors.
    Never update or delete rows here.
    """
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    referral   = models.ForeignKey(
        Referral,
        on_delete=models.CASCADE,
        related_name="status_logs",
    )
    from_status = models.CharField(max_length=12, blank=True)
    to_status   = models.CharField(max_length=12)
    changed_by  = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="referral_status_changes",
    )
    note        = models.TextField(blank=True)
    timestamp   = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["timestamp"]

    def __str__(self):
        return f"{self.referral_id}: {self.from_status} → {self.to_status}"


class Notification(models.Model):
    """
    Tracks alerts sent to receiving facilities when a referral is created
    or its status changes. Ready for Africa's Talking / Twilio integration.
    """
    class Channel(models.TextChoices):
        SMS   = "sms",   "SMS"
        PUSH  = "push",  "Push Notification"
        EMAIL = "email", "Email"

    class NotificationStatus(models.TextChoices):
        PENDING   = "pending",   "Pending"
        SENT      = "sent",      "Sent"
        FAILED    = "failed",    "Failed"

    id       = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    referral = models.ForeignKey(
        Referral,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    channel  = models.CharField(max_length=10, choices=Channel.choices)
    status   = models.CharField(
        max_length=10,
        choices=NotificationStatus.choices,
        default=NotificationStatus.PENDING,
    )
    sent_at  = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-sent_at"]

    def __str__(self):
        return f"{self.channel} — {self.status} for referral {self.referral_id}"
