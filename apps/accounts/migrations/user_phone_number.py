"""
Migration: add phone_number to accounts.User
--------------------------------------------
Run after placing this file in apps/accounts/migrations/.

    python manage.py migrate accounts

The field is intentionally blank/optional so existing users are unaffected.
Prompt health workers and facility admins to fill this in via the profile
settings page in NeomatCare so SMS alerts can reach them.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    # Replace "0001_initial" with the actual latest migration name in
    # apps/accounts/migrations/ before running.
    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="phone_number",
            field=models.CharField(
                max_length=20,
                blank=True,
                default="",
                help_text=(
                    "E.164 format required for SMS alerts, e.g. +233201234567. "
                    "Health workers and facility admins must fill this in to "
                    "receive referral and consultation SMS notifications."
                ),
            ),
        ),
    ]
