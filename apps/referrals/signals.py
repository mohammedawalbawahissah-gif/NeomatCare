import logging
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from .models import Referral, ReferralStatus

logger = logging.getLogger(__name__)
_prev_status: dict = {}


@receiver(pre_save, sender=Referral)
def _capture_referral_status(sender, instance, **kwargs) -> None:
    if not instance.pk:
        return
    try:
        _prev_status[instance.pk] = (
            Referral.objects.values_list("status", flat=True).get(pk=instance.pk)
        )
    except Referral.DoesNotExist:
        pass


@receiver(post_save, sender=Referral)
def _on_referral_saved(sender, instance, created, **kwargs) -> None:
    if created:
        return

    previous = _prev_status.pop(instance.pk, None)
    if previous is None or previous == instance.status:
        return

    # Guard against missing notification service modules (not yet integrated)
    try:
        from sms_service import (
            notify_referral_pending,
            notify_referral_accepted,
            notify_referral_cancelled,
        )
        sms_available = True
    except ImportError:
        logger.warning("sms_service module not found — SMS notifications skipped.")
        sms_available = False

    try:
        from push_service import (
            push_referral_pending,
            push_referral_accepted,
            push_referral_cancelled,
        )
        push_available = True
    except ImportError:
        logger.warning("push_service module not found — push notifications skipped.")
        push_available = False

    if instance.status == ReferralStatus.PENDING:
        if sms_available:
            notify_referral_pending(instance)
        if push_available:
            push_referral_pending(instance)

    elif instance.status == ReferralStatus.ACCEPTED:
        if sms_available:
            notify_referral_accepted(instance)
        if push_available:
            push_referral_accepted(instance)

    elif instance.status == ReferralStatus.CANCELLED:
        if sms_available:
            notify_referral_cancelled(instance)
        if push_available:
            push_referral_cancelled(instance)
