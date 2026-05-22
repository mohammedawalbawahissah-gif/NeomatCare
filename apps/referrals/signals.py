"""
apps/referrals/signals.py
--------------------------
Django signals that fire SMS alerts when a Referral changes status.

Registered in ReferralsConfig.ready() inside apps.py.

Trigger map:
    DRAFT → PENDING    → notify facility admins + patient
    PENDING → ACCEPTED → notify health worker + patient
    PENDING → CANCELLED → notify health worker + patient
"""
import logging

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from .models import Referral, ReferralStatus

logger = logging.getLogger(__name__)

# In-process cache of the status value *before* a save.
# Keyed by referral PK (UUID). Cleaned up immediately after post_save.
_prev_status: dict = {}


@receiver(pre_save, sender=Referral)
def _capture_referral_status(sender, instance, **kwargs) -> None:
    """
    Read and cache the current (pre-save) status so post_save can detect
    whether the status actually changed.
    """
    if not instance.pk:
        return  # New instance — nothing to capture
    try:
        _prev_status[instance.pk] = (
            Referral.objects.values_list("status", flat=True).get(pk=instance.pk)
        )
    except Referral.DoesNotExist:
        pass


@receiver(post_save, sender=Referral)
def _on_referral_saved(sender, instance, created, **kwargs) -> None:
    """
    After every Referral save, check whether the status changed and fire
    the appropriate SMS notification function.
    """
    if created:
        # Newly created referrals start as DRAFT — no SMS yet
        return

    previous = _prev_status.pop(instance.pk, None)

    if previous is None or previous == instance.status:
        return  # No status transition occurred

    logger.debug(
        "Referral %s status: %s → %s", instance.pk, previous, instance.status
    )

    # Lazy import to avoid circular imports at module load time
    from sms_service import (
        notify_referral_accepted,
        notify_referral_cancelled,
        notify_referral_pending,
    )

    if instance.status == ReferralStatus.PENDING:
        notify_referral_pending(instance)

    elif instance.status == ReferralStatus.ACCEPTED:
        notify_referral_accepted(instance)

    elif instance.status == ReferralStatus.CANCELLED:
        notify_referral_cancelled(instance)
