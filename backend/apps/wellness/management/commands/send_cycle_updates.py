"""
apps/wellness/management/commands/send_cycle_updates.py
----------------------------------------------------------------
Run once daily (Railway Cron Job — see setup notes below).

For every patient-role user with at least one logged CycleEntry:
  - compute predict_next_cycle(user)
  - if today falls within PERIOD_REMINDER_LEAD_DAYS of the predicted
    next period start, send an upcoming-period reminder
  - if today IS the predicted fertile window start date, send a
    fertile-window reminder

Both route through apps.notifications.notify() with
notif_type=CYCLE_REMINDER — patients get in-app only (see notify()).

De-duplication: CycleTrackerState.last_notified_predicted_start tracks
the predicted next-period date we last notified for. If the prediction
hasn't moved since (i.e. no new CycleEntry logged), we don't re-send
on the next daily run.

Usage:
    python manage.py send_cycle_updates

Railway setup (Cron Job service, separate from the web service):
    Command: python manage.py send_cycle_updates
    Schedule: 0 7 * * *   (once daily, 7am)
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.notifications.models import NotificationType
from apps.notifications.services import notify
from apps.wellness.models import CycleTrackerState
from apps.wellness.services import predict_next_cycle

PERIOD_REMINDER_LEAD_DAYS = 2


class Command(BaseCommand):
    help = "Send cycle/fertile-window reminders to patients with logged CycleEntry history."

    def handle(self, *args, **options):
        User = get_user_model()
        today = timezone.now().date()

        users = (
            User.objects.filter(role="patient", cycle_entries__isnull=False)
            .distinct()
        )

        sent, skipped = 0, 0

        for user in users:
            prediction = predict_next_cycle(user)
            if not prediction["has_prediction"]:
                skipped += 1
                continue

            next_start = prediction["predicted_next_period_start"]
            fertile_start = prediction["predicted_fertile_window"][0]

            state, _ = CycleTrackerState.objects.get_or_create(user=user)
            already_notified_for_this_cycle = (
                state.last_notified_predicted_start == next_start
            )

            days_until_period = (next_start - today).days
            is_fertile_window_start = today == fertile_start

            should_notify_period = (
                0 <= days_until_period <= PERIOD_REMINDER_LEAD_DAYS
                and not already_notified_for_this_cycle
            )
            should_notify_fertile = (
                is_fertile_window_start and not already_notified_for_this_cycle
            )

            if not (should_notify_period or should_notify_fertile):
                skipped += 1
                continue

            if should_notify_fertile:
                title = "Fertile window starting"
                message = (
                    "Your predicted fertile window starts today, "
                    "based on your logged cycles."
                )
            else:
                title = f"Period expected in {days_until_period} day(s)"
                message = (
                    f"Based on your logged cycles, your next period is "
                    f"predicted around {next_start.strftime('%b %d')}."
                )

            notify(
                user,
                NotificationType.CYCLE_REMINDER,
                title,
                message,
                url="/app/portal",
                related_app="wellness",
                related_id=user.id,
            )

            state.last_notified_date = today
            state.last_notified_predicted_start = next_start
            state.save(update_fields=["last_notified_date", "last_notified_predicted_start"])
            sent += 1

        self.stdout.write(
            self.style.SUCCESS(f"Cycle updates: sent={sent}, skipped={skipped}")
        )
