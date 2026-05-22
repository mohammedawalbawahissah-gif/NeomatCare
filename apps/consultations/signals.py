import logging
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from .models import Consultation, ConsultationStatus

logger = logging.getLogger(__name__)
_prev_status: dict = {}


@receiver(pre_save, sender=Consultation)
def _capture_consultation_status(sender, instance, **kwargs) -> None:
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
    from sms_service import (
        notify_consultation_requested,
        notify_consultation_accepted,
        notify_consultation_declined,
    )
    from push_service import (
        push_consultation_requested,
        push_consultation_accepted,
        push_consultation_declined,
    )

    if created:
        notify_consultation_requested(instance)
        push_consultation_requested(instance)
        return

    previous = _prev_status.pop(instance.pk, None)
    if previous is None or previous == instance.status:
        return

    if instance.status == ConsultationStatus.ACCEPTED:
        notify_consultation_accepted(instance)
        push_consultation_accepted(instance)

    elif instance.status == ConsultationStatus.DECLINED:
        notify_consultation_declined(instance)
        push_consultation_declined(instance)