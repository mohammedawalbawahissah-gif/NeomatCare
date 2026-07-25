"""
apps/accounts/management/commands/wipe_production_data.py
------------------------------------------------------------
Deletes every operational record in the database — patients, emergency
cases, referrals, notifications, consultations, transport, wellness data,
facilities, and every user account except superadmins — leaving the app
"as good as new" with only its superadmin accounts intact.

THIS IS IRREVERSIBLE. Take a full database backup before running this
against production. On Railway:

    railway run pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d_%H%M).sql

Usage:
    # Dry run (default) — reports exactly what would be deleted, deletes nothing
    python manage.py wipe_production_data

    # Actually execute the wipe (interactive — will ask you to type a
    # confirmation phrase before touching anything)
    python manage.py wipe_production_data --execute

    # Non-interactive execute, e.g. for a one-off Railway shell that
    # doesn't give you an interactive prompt — you must supply the exact
    # phrase yourself, deliberately, as a command-line argument:
    python manage.py wipe_production_data --execute --yes-i-am-sure="WIPE PRODUCTION"

Deletion order matters because several models use on_delete=PROTECT
(Referral -> EmergencyCase/HealthFacility/User, EmergencyCase ->
Patient/User/HealthFacility). Protected parents are only safe to delete
once every row that PROTECTs them is already gone, so this command
deletes in that dependency order, deepest first. Models related via
CASCADE are not deleted explicitly — Django cascades those automatically
when their parent is deleted — except where a relation is
SET_NULL (e.g. SpecialistProfile.user, Driver.user), which would
otherwise leave clean-looking but orphaned rows behind; those are deleted
explicitly too.
"""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q

CONFIRM_PHRASE = "WIPE PRODUCTION"


class Command(BaseCommand):
    help = "Irreversibly wipes all data except superadmin accounts. Dry-run by default."

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
                "Only use this for a genuinely non-interactive shell — prefer the interactive "
                "prompt whenever you have one, it's a much better guard against a mistake."
            ),
        )

    def handle(self, *args, **options):
        from apps.accounts.models import User
        from apps.cases.models import Patient, ANCVisit, PatientConsent, EmergencyCase, TriageNote
        from apps.consultations.models import SpecialistProfile, Consultation, ConsultationMessage, CallSignal
        from apps.facilities.models import HealthFacility
        from apps.notifications.models import Notification as InAppNotification
        from apps.referrals.models import Referral
        from apps.transport.models import Driver, Vehicle, TransportRequest
        from apps.wellness.models import CycleEntry

        # Deletion order: deepest PROTECT-dependents first, so nothing ever
        # errors out with a ProtectedError partway through. Comment on each
        # line notes why it's safe at that point.
        plan = [
            ("In-app notifications",        InAppNotification.objects.all()),
            ("Consultation call signals",   CallSignal.objects.all()),
            ("Consultation messages",       ConsultationMessage.objects.all()),
            ("Consultations",               Consultation.objects.all()),
            ("Specialist profiles",         SpecialistProfile.objects.all()),
            ("Transport requests",          TransportRequest.objects.all()),
            ("Vehicles",                    Vehicle.objects.all()),
            ("Drivers",                     Driver.objects.all()),
            ("Cycle tracker entries",       CycleEntry.objects.all()),
            # Referral PROTECTs EmergencyCase/HealthFacility/User — must go first.
            # Cascades: referrals.Notification, ReferralStatusLog.
            ("Referrals",                   Referral.objects.all()),
            # TriageNote PROTECTs nothing upstream of what we're deleting;
            # it CASCADEs from EmergencyCase anyway, but deleting it first
            # is harmless and keeps this list self-documenting.
            ("Triage notes",                TriageNote.objects.all()),
            # EmergencyCase PROTECTs Patient/HealthFacility/User — must go
            # before those. Referral (above) already cleared, so this is
            # now safe.
            ("Emergency cases",             EmergencyCase.objects.all()),
            # Patient's own PROTECT (from EmergencyCase) is now clear.
            # Cascades: ANCVisit, PatientConsent, PregnancyTrackerState.
            ("ANC visits",                  ANCVisit.objects.all()),
            ("Patient consents",            PatientConsent.objects.all()),
            ("Patients",                    Patient.objects.all()),
            # HealthFacility's PROTECT (from EmergencyCase/Referral) is now
            # clear. Cascades: FacilityCapacityLog.
            ("Health facilities",           HealthFacility.objects.all()),
        ]

        # Non-superadmin users last: every PROTECT relation pointing at
        # User (EmergencyCase.created_by, Referral.created_by,
        # TriageNote.created_by) has already been cleared above. CASCADEs
        # from here: OTPVerification, PatientServiceReview, in-app
        # notifications already deleted above but recipient CASCADE would
        # have handled it too.
        non_superadmin_users = User.objects.exclude(Q(role="superadmin") | Q(is_superuser=True))
        plan.append(("Non-superadmin users", non_superadmin_users))

        self.stdout.write(self.style.WARNING("\n=== Wipe plan (dependency order) ===\n"))
        total = 0
        for label, qs in plan:
            count = qs.count()
            total += count
            self.stdout.write(f"  {label:<28} {count:>6} row(s)")

        kept = User.objects.filter(Q(role="superadmin") | Q(is_superuser=True)).count()
        self.stdout.write(self.style.SUCCESS(f"\n  Superadmin accounts kept:   {kept:>6}"))
        self.stdout.write(self.style.WARNING(f"\n  TOTAL rows to delete:       {total:>6}\n"))

        if not options["execute"]:
            self.stdout.write(self.style.NOTICE(
                "Dry run only — nothing was deleted. Re-run with --execute to proceed."
            ))
            return

        if kept == 0:
            raise CommandError(
                "No superadmin account exists in this database. Refusing to proceed — "
                "wiping everything with no superadmin left would lock you out entirely. "
                "Create a superadmin first (python manage.py createsuperuser)."
            )

        env_label = getattr(settings, "RAILWAY_ENVIRONMENT_NAME", None) or getattr(
            settings, "DJANGO_SETTINGS_MODULE", "this environment"
        )

        confirm_phrase = options.get("confirm_phrase")
        if confirm_phrase is None:
            self.stdout.write(self.style.ERROR(
                f"\nYou are about to IRREVERSIBLY DELETE {total} row(s) from: {env_label}\n"
                f"This cannot be undone. Make sure you have a fresh database backup.\n"
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
            f"\nDone. {kept} superadmin account(s) preserved, everything else wiped."
        ))
