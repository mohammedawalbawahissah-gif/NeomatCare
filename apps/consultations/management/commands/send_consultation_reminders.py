"""
apps/consultations/management/commands/send_consultation_reminders.py
----------------------------------------------------------------------
Management command to send SMS reminders for consultations that have been
REQUESTED but not responded to within a configurable threshold.

Usage:
    # Remind for consultations pending > 15 minutes (default)
    python manage.py send_consultation_reminders

    # Remind for consultations pending > 30 minutes
    python manage.py send_consultation_reminders --minutes 30

Schedule via cron (every 15 minutes):
    */15 * * * * cd /path/to/project && pipenv run python manage.py send_consultation_reminders

Or via Celery beat (add to CELERY_BEAT_SCHEDULE in settings):
    "send-consultation-reminders": {
        "task": "apps.consultations.tasks.send_reminders",
        "schedule": crontab(minute="*/15"),
    }
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Send SMS reminders for stale unanswered consultation requests."

    def add_arguments(self, parser):
        parser.add_argument(
            "--minutes",
            type=int,
            default=15,
            help="Remind about consultations pending for longer than this many minutes (default: 15).",
        )

    def handle(self, *args, **options):
        from sms_service import send_consultation_reminders

        stale_minutes = options["minutes"]
        self.stdout.write(
            f"Checking for consultations pending > {stale_minutes} minutes..."
        )

        count = send_consultation_reminders(stale_minutes=stale_minutes)

        self.stdout.write(
            self.style.SUCCESS(f"Done — {count} reminder SMS(es) sent.")
        )
