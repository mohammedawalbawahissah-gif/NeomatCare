"""
apps/cases/management/commands/reset_demo_data.py
------------------------------------------------------------
A lighter, repeatable sibling of wipe_production_data (see
apps/accounts/management/commands/wipe_production_data.py) for resetting
between demo sessions. This one is scoped to the data a demo actually
generates — patients, cases, referrals, notifications, consultations,
transport requests, and patient wellness data — and deliberately leaves
alone everything that represents real setup work you don't want to redo
before every demo: health facilities and every user account (all roles,
not just superadmin).

THIS IS STILL IRREVERSIBLE for what it does touch. Same rule as the full
wipe: back up before running this against anything that has real (not
demo) case data in it.

    railway run pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d_%H%M).sql

Usage:
    # Dry run (default) — reports exactly what would be deleted, deletes nothing
    python manage.py reset_demo_data

    # Actually execute — interactive, will ask you to type a confirmation phrase
    python manage.py reset_demo_data --execute

    # Non-interactive (e.g. a shell alias you run before every demo) — you
    # still have to supply the exact phrase yourself, deliberately:
    python manage.py reset_demo_data --execute --yes-i-am-sure="RESET DEMO DATA"

Deleted: notifications (in-app), consultations (and their messages/call
signals via cascade), transport requests, referrals (and their status
logs/delivery-tracking rows via cascade), triage notes, emergency cases,
ANC visits, patient consents, patient service reviews, pregnancy tracker
state, cycle tracker entries, and patient records themselves.

Left untouched: health facilities, every user account of every role,
driver and vehicle records, and specialist profiles — the things you'd
otherwise have to recreate by hand before every demo.

Deletion order matters here too: Referral and EmergencyCase both use
on_delete=PROTECT against Patient (and EmergencyCase against Patient
specifically), so Patient can only be deleted once both are already
gone. Nothing here PROTECTs against HealthFacility or User, so those
never need to be touched, which is exactly the point of this command.
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

CONFIRM_PHRASE = "RESET DEMO DATA"


class Command(BaseCommand):
    help = "Resets operational/demo data (patients, cases, referrals, etc.) while keeping facilities and all user accounts. Dry-run by default."

    def add_arguments(self, parser):
        parser.add_argument(
            "--execute",
            action="store_true",
            help="Actually perform the deletion. Without this flag, only a dry-run report is printed.",
        )
        parser.add_argument(
            "--yes-i-am-sure",
            dest="confirm_phrase",
            default=None,
            help=(
                f'Skip the interactive prompt by passing the exact phrase "{CONFIRM_PHRASE}". '
                "Fine to script for a repeatable pre-demo reset, since the scope here is much "
                "narrower than the full wipe — but still only ever pass this deliberately."
            ),
        )

    def handle(self, *args, **options):
        from apps.accounts.models import PatientServiceReview
        from apps.cases.models import Patient, ANCVisit, PatientConsent, EmergencyCase, TriageNote
        from apps.consultations.models import Consultation
        from apps.notifications.models import Notification as InAppNotification
        from apps.referrals.models import Referral
        from apps.transport.models import TransportRequest
        from apps.wellness.models import CycleEntry, PregnancyTrackerState

        # Deepest PROTECT-dependents first — same principle as
        # wipe_production_data, narrower scope. Facilities and users are
        # never in this list, so their own PROTECT/SET_NULL relations never
        # come into play here.
        plan = [
            ("In-app notifications",        InAppNotification.objects.all()),
            # Consultation cascades its ConsultationMessage and CallSignal rows.
            ("Consultations",               Consultation.objects.all()),
            ("Transport requests",          TransportRequest.objects.all()),
            ("Patient service reviews",     PatientServiceReview.objects.all()),
            ("Cycle tracker entries",       CycleEntry.objects.all()),
            # Referral PROTECTs EmergencyCase — must go first.
            # Cascades: referrals.Notification, ReferralStatusLog.
            ("Referrals",                   Referral.objects.all()),
            ("Triage notes",                TriageNote.objects.all()),
            # EmergencyCase PROTECTs Patient — must go before Patient.
            ("Emergency cases",             EmergencyCase.objects.all()),
            # Cascades from Patient: PregnancyTrackerState (explicit below anyway).
            ("ANC visits",                  ANCVisit.objects.all()),
            ("Patient consents",            PatientConsent.objects.all()),
            ("Pregnancy tracker state",      PregnancyTrackerState.objects.all()),
            ("Patients",                    Patient.objects.all()),
        ]

        self.stdout.write(self.style.WARNING("\n=== Demo reset plan (dependency order) ===\n"))
        total = 0
        for label, qs in plan:
            count = qs.count()
            total += count
            self.stdout.write(f"  {label:<28} {count:>6} row(s)")

        self.stdout.write(self.style.SUCCESS(
            "\n  Health facilities, user accounts (all roles), drivers, "
            "vehicles, and specialist profiles are NOT touched by this command."
        ))
        self.stdout.write(self.style.WARNING(f"\n  TOTAL rows to delete:       {total:>6}\n"))

        if not options["execute"]:
            self.stdout.write(self.style.NOTICE(
                "Dry run only — nothing was deleted. Re-run with --execute to proceed."
            ))
            return

        confirm_phrase = options.get("confirm_phrase")
        if confirm_phrase is None:
            self.stdout.write(self.style.ERROR(
                f"\nYou are about to delete {total} row(s) of operational/demo data.\n"
                f"This cannot be undone.\n"
            ))
            typed = input(f'Type "{CONFIRM_PHRASE}" to proceed, anything else to abort: ')
        else:
            typed = confirm_phrase

        if typed != CONFIRM_PHRASE:
            self.stdout.write(self.style.NOTICE("Aborted — confirmation phrase did not match. Nothing was deleted."))
            return

        with transaction.atomic():
            for label, qs in plan:
                deleted_count, _ = qs.delete()
                self.stdout.write(f"  Deleted {label}: {deleted_count}")

        self.stdout.write(self.style.SUCCESS(
            "\nDone. Facilities and all user accounts are untouched — "
            "operational/demo data has been reset."
        ))
