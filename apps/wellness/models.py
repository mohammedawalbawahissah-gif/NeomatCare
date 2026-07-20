"""
apps/wellness/models.py
------------------------
Two independent self-service trackers for patient-role users:

  CycleEntry            — logged menstrual period dates, used to predict
                            the next period / fertile window.
  PregnancyTrackerState  — one row per pregnant Patient; records which
                            week/day they were last sent an AI update for,
                            so the daily job never re-notifies the same
                            content twice.

Gestational age itself is NOT stored here — it's computed on the fly
from Patient.expected_delivery_date (already on cases.Patient), since
that's the single source of truth and can't drift out of sync with
whatever a clinician updates it to.
"""
import uuid

from django.conf import settings
from django.db import models


class CycleEntry(models.Model):
    id   = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cycle_entries",
        limit_choices_to={"role": "patient"},
    )
    period_start = models.DateField()
    period_end   = models.DateField(null=True, blank=True)
    symptoms     = models.JSONField(default=list, blank=True)
    notes        = models.TextField(blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "wellness_cycle_entry"
        ordering = ["-period_start"]

    def __str__(self):
        return f"Cycle entry for {self.user_id} starting {self.period_start}"


class CycleTrackerState(models.Model):
    """One row per patient-role user with logged CycleEntry history.
    Records the predicted next-period start date we last sent a
    reminder for, so send_cycle_updates never re-notifies for the
    same predicted cycle twice on consecutive daily runs."""
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cycle_tracker_state",
        limit_choices_to={"role": "patient"},
    )
    last_notified_date = models.DateField(null=True, blank=True)
    last_notified_predicted_start = models.DateField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "wellness_cycle_tracker_state"

    def __str__(self):
        return f"Cycle tracker state for user {self.user_id}"


class PregnancyTrackerState(models.Model):
    patient = models.OneToOneField(
        "cases.Patient",
        on_delete=models.CASCADE,
        related_name="tracker_state",
    )
    last_notified_week = models.PositiveIntegerField(null=True, blank=True)
    last_notified_date = models.DateField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "wellness_pregnancy_tracker_state"

    def __str__(self):
        return f"Tracker state for patient {self.patient_id} (week {self.last_notified_week})"
