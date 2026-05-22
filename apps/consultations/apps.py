"""
apps/consultations/apps.py
---------------------------
Registers consultation signals so SMS notifications fire on status changes.
Replace your existing apps/consultations/apps.py with this file.
"""
from django.apps import AppConfig


class ConsultationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.consultations"

    def ready(self) -> None:
        import apps.consultations.signals  # noqa: F401  — registers signal handlers
