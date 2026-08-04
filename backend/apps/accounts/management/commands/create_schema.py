from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    """
    Creates the Postgres schema named in DB_SCHEMA if it doesn't already exist.

    Needed because this app shares a single Postgres instance with other
    apps (FarmAsyst North, LaafiTech, Wolbi Royal Enterprise). Each app
    gets its own schema so tables never collide. Must run BEFORE `migrate`,
    since Postgres won't resolve search_path to a schema that doesn't
    exist yet.
    """

    help = "Create the app's Postgres schema if it does not exist."

    def handle(self, *args, **options):
        schema = getattr(settings, "DB_SCHEMA", "public")

        if schema == "public":
            self.stdout.write(
                self.style.WARNING(
                    "DB_SCHEMA is 'public' — skipping schema creation. "
                    "If this instance is shared with another app, set a "
                    "distinct DB_SCHEMA env var to keep tables isolated."
                )
            )
            return

        with connection.cursor() as cursor:
            cursor.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')

        self.stdout.write(self.style.SUCCESS(f"Schema '{schema}' is ready."))
