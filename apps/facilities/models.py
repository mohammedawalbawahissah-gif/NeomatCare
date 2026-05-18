"""
apps/facilities/models.py
--------------------------
Models:
  HealthFacility       — healthcare facility registry with real-time capacity
  FacilityCapacityLog  — timestamped audit trail of every capacity change

The capacity fields on HealthFacility are updated in real time by facility
admins via PATCH /api/facilities/{id}/capacity/. Every update writes a
snapshot to FacilityCapacityLog so the referral engine always has an
auditable history.
"""
import uuid
from django.db import models
from django.utils import timezone


class FacilityLevel(models.IntegerChoices):
    COMMUNITY   = 1, "Community / CHPS"
    PRIMARY     = 2, "Primary / District"
    SECONDARY   = 3, "Secondary / Regional"
    TERTIARY    = 4, "Tertiary / Teaching"


class HealthFacility(models.Model):
    """
    Represents a healthcare facility that can send or receive referrals.

    Capacity fields are intentionally flat (not in a related table) so the
    referral engine can read them in a single query without joins.
    The FacilityCapacityLog model handles the audit trail separately.
    """
    id        = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name      = models.CharField(max_length=255)
    level     = models.IntegerField(choices=FacilityLevel.choices)
    district  = models.CharField(max_length=100, blank=True)
    region    = models.CharField(max_length=100, blank=True)

    # GPS coordinates
    latitude  = models.FloatField()
    longitude = models.FloatField()

    # Services offered — stored as a list of string codes
    # e.g. ["OBSTETRICS", "SURGERY", "ICU", "NICU", "BLOOD_BANK"]
    available_services = models.JSONField(default=list, blank=True)

    # ── Real-time capacity fields ──────────────────────────────────────────
    # Updated via PATCH /api/facilities/{id}/capacity/
    # The referral engine reads these directly during scoring.
    icu_beds_available   = models.PositiveIntegerField(default=0)
    nicu_cots_available  = models.PositiveIntegerField(default=0)
    theatre_available    = models.BooleanField(default=False)
    blood_bank           = models.BooleanField(default=False)
    on_call_specialist   = models.BooleanField(default=False)

    # ── Meta ──────────────────────────────────────────────────────────────
    phone     = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering        = ["name"]
        verbose_name    = "health facility"
        verbose_name_plural = "health facilities"
        indexes = [
            # Speed up the common engine query: active facilities by level
            models.Index(fields=["is_active", "level"]),
        ]

    def __str__(self):
        return f"{self.name} (Level {self.level})"

    def capacity_snapshot(self) -> dict:
        """
        Returns the current capacity state as a dict.
        Used by FacilityCapacityLog to snapshot state at time of change.
        """
        return {
            "icu_beds_available":  self.icu_beds_available,
            "nicu_cots_available": self.nicu_cots_available,
            "theatre_available":   self.theatre_available,
            "blood_bank":          self.blood_bank,
            "on_call_specialist":  self.on_call_specialist,
        }


class FacilityCapacityLog(models.Model):
    """
    Immutable audit log of every capacity change to a HealthFacility.

    Never update or delete rows in this table — it is an append-only
    record used by clinical auditors and the analytics dashboard.
    """
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    facility   = models.ForeignKey(
        HealthFacility,
        on_delete=models.CASCADE,
        related_name="capacity_logs",
    )
    changed_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="capacity_changes",
    )
    # Full capacity snapshot at the moment of this change
    snapshot   = models.JSONField()
    timestamp  = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering     = ["-timestamp"]
        verbose_name = "capacity log entry"

    def __str__(self):
        return f"{self.facility.name} — {self.timestamp:%Y-%m-%d %H:%M}"
