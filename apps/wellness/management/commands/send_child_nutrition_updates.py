"""
apps/wellness/management/commands/send_child_nutrition_updates.py
--------------------------------------------------------------------
Run once daily (Render Cron Job — same setup pattern as
send_pregnancy_updates.py).

For every child Patient (patient_type="child") with:
  - age information on file (date_of_birth or age), and
  - a household with at least one member who has a linked patient_user
    (a caregiver with a portal account)

...compute their current age band. If it's a NEW band since last
notified (or they've never been notified), send the feeding guidance +
danger-sign reminder to every portal-linked caregiver in the household —
via apps.notifications, same in-app-only routing patient-role recipients
already get.

A child itself typically has no portal login (patient_user is null) —
the notification recipient is whichever household member(s) DO have one
(the caregiver), not the child record.

Usage:
    python manage.py send_child_nutrition_updates

Render setup (Cron Job, separate from the web service):
    Command: python manage.py send_child_nutrition_updates
    Schedule: 0 6 * * *   (once daily, 6am — same slot as pregnancy updates)
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.cases.models import Patient
from apps.notifications.services import notify
from apps.wellness.models import ChildNutritionTrackerState
from apps.wellness.services import get_child_nutrition_snapshot


class Command(BaseCommand):
    help = "Send age-band-aware nutrition/feeding update to caregivers of under-five children with a linked household."

    def handle(self, *args, **options):
        today = timezone.now().date()
        candidates = Patient.objects.filter(
            patient_type="child",
            deleted_at__isnull=True,
        ).select_related("household")

        sent, skipped = 0, 0

        for child in candidates:
            snapshot = get_child_nutrition_snapshot(child)
            if not snapshot:
                skipped += 1
                continue

            if not child.household_id:
                skipped += 1
                continue

            caregivers = [
                m.patient_user for m in child.household.members.filter(
                    deleted_at__isnull=True, patient_user__isnull=False
                )
            ]
            if not caregivers:
                skipped += 1
                continue

            state, _ = ChildNutritionTrackerState.objects.get_or_create(patient=child)
            age_band = snapshot["age_band"]

            already_notified_today = state.last_notified_date == today
            same_band_already_done = state.last_notified_age_band == age_band

            if already_notified_today or same_band_already_done:
                skipped += 1
                continue

            feeding_tip = snapshot["feeding_tips"][0] if snapshot["feeding_tips"] else ""
            message = f"Feeding guidance for {child.patient_name} ({age_band}): {feeding_tip}"

            for caregiver in caregivers:
                notify(
                    caregiver,
                    "child_nutrition_update",
                    f"{child.patient_name} — {age_band} feeding guidance",
                    message,
                    url="/app/portal#nutrition",
                    related_app="wellness",
                    related_id=child.id,
                )

            state.last_notified_age_band = age_band
            state.last_notified_date = today
            state.save(update_fields=["last_notified_age_band", "last_notified_date"])
            sent += 1

        self.stdout.write(
            self.style.SUCCESS(f"Child nutrition updates: sent={sent}, skipped={skipped}")
        )
