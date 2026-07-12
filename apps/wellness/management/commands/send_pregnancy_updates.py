"""
apps/wellness/management/commands/send_pregnancy_updates.py
--------------------------------------------------------------
Run once daily (Render Cron Job — see setup notes below).

For every Patient with:
  - an expected_delivery_date set, and
  - a linked patient_user (portal account), and
  - a still-in-range pregnancy (not overdue by more than a couple weeks)

...compute their current week. If it's a NEW week since last notified
(or they've never been notified), generate a personalized AI message
and send it via apps.notifications — which already routes patient-role
recipients to in-app only, no email/SMS (see notify()).

Usage:
    python manage.py send_pregnancy_updates

Render setup (Cron Job, separate from the web service):
    Command: python manage.py send_pregnancy_updates
    Schedule: 0 6 * * *   (once daily, 6am)
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.cases.models import Patient
from apps.notifications.services import notify
from apps.wellness.models import PregnancyTrackerState
from apps.wellness.services import generate_ai_message, get_pregnancy_snapshot


class Command(BaseCommand):
    help = "Send AI-personalized daily pregnancy updates to patients with a linked portal account."

    def handle(self, *args, **options):
        today = timezone.now().date()
        candidates = Patient.objects.filter(
            expected_delivery_date__isnull=False,
            patient_user__isnull=False,
            deleted_at__isnull=True,
        )

        sent, skipped = 0, 0

        for patient in candidates:
            snapshot = get_pregnancy_snapshot(patient)
            if not snapshot:
                skipped += 1
                continue

            # Overdue by more than 2 weeks — stop the daily nudge; that's a
            # clinical situation for the care team, not a wellness reminder.
            if snapshot["days_remaining"] == 0 and (today - patient.expected_delivery_date).days > 14:
                skipped += 1
                continue

            state, _ = PregnancyTrackerState.objects.get_or_create(patient=patient)
            current_week = snapshot["current_week"]

            already_notified_today = state.last_notified_date == today
            same_week_already_done = state.last_notified_week == current_week

            if already_notified_today or same_week_already_done:
                skipped += 1
                continue

            message = generate_ai_message(patient.patient_name or "there", snapshot)

            notify(
                patient.patient_user,
                "pregnancy_update",
                f"Week {current_week} check-in",
                message,
                url="/app/portal",
                related_app="wellness",
                related_id=patient.id,
            )

            state.last_notified_week = current_week
            state.last_notified_date = today
            state.save(update_fields=["last_notified_week", "last_notified_date"])
            sent += 1

        self.stdout.write(
            self.style.SUCCESS(f"Pregnancy updates: sent={sent}, skipped={skipped}")
        )
