"""
apps/consultations/signals.py
------------------------------
Django signals that fire SMS alerts when a Consultation is created or
its status changes.

Registered in ConsultationsConfig.ready() inside apps.py.

Trigger map:
    Created               → notify assigned specialist (if set)
    REQUESTED → ACCEPTED  → notify requesting health worker
    REQUESTED → DECLINED  → notify requesting health worker
"""
import logging

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from .models import Consultation, ConsultationStatus

logger = logging.getLogger(__name__)

# In-process cache of pre-save status, keyed by consultation PK
_prev_status: dict = {}


@receiver(pre_save, sender=Consultation)
def _capture_consultation_status(sender, instance, **kwargs) -> None:
    """Cache the current status before the save so post_save can diff it."""
    if not instance.pk:
        return
    try:
        _prev_status[instance.pk] = (
            Consultation.objects.values_list("status", flat=True).get(pk=instance.pk)
        )
    except Consultation.DoesNotExist:
        pass


@receiver(post_save, sender=Consultation)
def _on_consultation_saved(sender, instance, created, **kwargs) -> None:
    """
    Fire SMS when:
    - A new Consultation is created → alert the specialist
    - Status changes to ACCEPTED    → alert the requesting worker
    - Status changes to DECLINED    → alert the requesting worker
    """
    from sms_service import (
        notify_consultation_accepted,
        notify_consultation_declined,
        notify_consultation_requested,
    )

    if created:
        notify_consultation_requested(instance)
        return

    previous = _prev_status.pop(instance.pk, None)

    if previous is None or previous == instance.status:
        return  # No status transition

    logger.debug(
        "Consultation %s status: %s → %s", instance.pk, previous, instance.status
    )

    if instance.status == ConsultationStatus.ACCEPTED:
        notify_consultation_accepted(instance)

    elif instance.status == ConsultationStatus.DECLINED:
        notify_consultation_declined(instance)
