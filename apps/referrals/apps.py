"""
apps/referrals/apps.py
-----------------------
Registers referral signals so SMS notifications fire on status transitions.
Replace your existing apps/referrals/apps.py with this file.
"""
from django.apps import AppConfig


class ReferralsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.referrals"

    def ready(self) -> None:
        import apps.referrals.signals  # noqa: F401  — registers signal handlers
