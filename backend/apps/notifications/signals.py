"""
apps/notifications/signals.py
-------------------------------
Every notification-worthy event notifies BOTH the person who acted
and the people affected/informed by that action — this is a health
system, and accountability means the actor's own audit trail shows
"you did this" just as clearly as the recipient's shows "this
happened to you."

Covers: referrals, cases (including ANC visits and consent),
consultations, transport, facility capacity, and patient service
reviews — spanning every role: health_worker, facility_admin,
specialist, driver, superadmin, and patient.

Where a model records who acted (Referral.created_by,
ReferralStatusLog.changed_by, EmergencyCase.created_by,
TransportRequest.requested_by, Consultation.requested_by,
FacilityCapacityLog.changed_by), we use that field directly rather
than guessing.

KNOWN LIMITATIONS:
- Consultation and TransportRequest have no changed_by/updated_by
  field, only requested_by (the original creator). For status
  changes on those two, we notify all known parties (creator +
  specialist / creator + driver) symmetrically rather than
  distinguishing actor from recipient.
- PatientServiceReview.facility_name is a plain text field, not a
  real FK to HealthFacility. Facility-staff notification for a
  review is a best-effort case-insensitive name match — if it
  doesn't match an existing facility, only superadmins are informed.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.accounts.models import PatientServiceReview, User
from apps.cases.models import ANCVisit, EmergencyCase, Patient, PatientConsent, RiskLevel
from apps.consultations.models import Consultation, ConsultationMessage
from apps.facilities.models import FacilityCapacityLog, HealthFacility
from apps.referrals.models import Referral, ReferralStatusLog
from apps.transport.models import TransportRequest

from .services import notify, notify_many

HIGH_RISK_DANGER_SIGNS = {
    "PPH", "APH", "RUPTURED_UTERUS", "ECLAMPSIA",
    "SEVERE_PRE_ECLAMPSIA", "CORD_PROLAPSE",
}


def _facility_staff(facility, roles=("health_worker", "facility_admin")):
    if not facility:
        return User.objects.none()
    return User.objects.filter(facility=facility, role__in=roles, is_active=True)


def _superadmins():
    return User.objects.filter(role="superadmin", is_active=True)


# ── Referrals ────────────────────────────────────────────────────────────
@receiver(post_save, sender=Referral)
def on_referral_created(sender, instance, created, **kwargs):
    """Status changes are handled by on_referral_status_logged below, via
    ReferralStatusLog — which actually records who acted. This handler
    only fires on creation, when Referral itself is the best source."""
    if not created:
        return

    notify(
        instance.created_by,
        "referral_new",
        "Referral sent",
        f"Your referral to {instance.receiving_facility.name} was sent.",
        url=f"/app/referrals/{instance.id}",
        related_app="referrals",
        related_id=instance.id,
    )

    recipients = list(_facility_staff(instance.receiving_facility)) + list(_superadmins())
    notify_many(
        recipients,
        "referral_new",
        "New referral received",
        f"A new referral has been sent to {instance.receiving_facility.name}.",
        url=f"/app/referrals/{instance.id}",
        related_app="referrals",
        related_id=instance.id,
    )


@receiver(post_save, sender=ReferralStatusLog)
def on_referral_status_logged(sender, instance, created, **kwargs):
    """This log row is created exactly once per real status transition and
    records changed_by accurately — a better signal than reacting to
    Referral saves, which fire on any field change, not just status."""
    if not created:
        return

    referral = instance.referral
    actor = instance.changed_by
    status_label = referral.get_status_display()

    if actor:
        notify(
            actor,
            "referral_status",
            f"You updated referral to {status_label}",
            f"Referral {referral.id} is now {status_label}.",
            url=f"/app/referrals/{referral.id}",
            related_app="referrals",
            related_id=referral.id,
        )

    recipients = {referral.created_by}
    recipients |= set(_facility_staff(referral.receiving_facility))
    patient_user = getattr(referral.emergency_case.patient, "patient_user", None)
    if patient_user:
        recipients.add(patient_user)
    if actor:
        recipients.discard(actor)

    notify_many(
        recipients,
        "referral_status",
        f"Referral status: {status_label}",
        f"Referral {referral.id} is now {status_label}.",
        url=f"/app/referrals/{referral.id}",
        related_app="referrals",
        related_id=referral.id,
    )


# ── Cases ────────────────────────────────────────────────────────────────
@receiver(post_save, sender=EmergencyCase)
def on_case_created(sender, instance, created, **kwargs):
    if not created:
        return

    notify(
        instance.created_by,
        "case_new",
        "Case logged",
        f"Your case at {instance.referring_facility.name} was logged.",
        url=f"/app/cases/{instance.id}",
        related_app="cases",
        related_id=instance.id,
    )

    # The patient themself — this is about them, they should know an
    # emergency case was opened, not just the staff handling it.
    patient_user = getattr(instance.patient, "patient_user", None)
    if patient_user:
        notify(
            patient_user,
            "case_new",
            "A case has been opened for you",
            f"An emergency case has been opened for you at {instance.referring_facility.name}.",
            url="/app/portal",
            related_app="cases",
            related_id=instance.id,
        )

    recipients = list(_facility_staff(instance.referring_facility, roles=("facility_admin",)))
    if set(instance.danger_signs or []) & HIGH_RISK_DANGER_SIGNS:
        recipients += list(_superadmins())
    recipients = [u for u in recipients if u.pk != instance.created_by.pk]
    notify_many(
        recipients,
        "case_new",
        "New emergency case logged",
        f"A new case was logged at {instance.referring_facility.name}.",
        url=f"/app/cases/{instance.id}",
        related_app="cases",
        related_id=instance.id,
    )


@receiver(post_save, sender=Patient)
def on_patient_risk_change(sender, instance, created, **kwargs):
    """System-computed (Patient.compute_risk), not a direct user action —
    no actor to notify symmetrically here, only the people who need to know."""
    if created or instance.risk_level != RiskLevel.HIGH:
        return
    recipients = list(
        _facility_staff(instance.registered_at_facility, roles=("facility_admin",))
    ) + list(_superadmins())
    notify_many(
        recipients,
        "patient_high_risk",
        "Patient flagged high risk",
        f"{instance.patient_name or 'A patient'} has been flagged high risk.",
        url=f"/app/patients/{instance.id}",
        related_app="cases",
        related_id=instance.id,
    )


# ── Consultations ────────────────────────────────────────────────────────
@receiver(post_save, sender=Consultation)
def on_consultation_saved(sender, instance, created, **kwargs):
    specialist_user = instance.specialist.user if instance.specialist else None

    if created:
        notify(
            instance.requested_by,
            "consultation_new",
            "Consultation request sent",
            "Your consultation request was sent.",
            url=f"/app/consultations/{instance.id}",
            related_app="consultations",
            related_id=instance.id,
        )
        if specialist_user:
            notify(
                specialist_user,
                "consultation_new",
                "New consultation request",
                "You have a new consultation request.",
                url=f"/app/consultations/{instance.id}",
                related_app="consultations",
                related_id=instance.id,
            )
        return

    recipients = [u for u in (instance.requested_by, specialist_user) if u]
    notify_many(
        recipients,
        "consultation_status",
        f"Consultation {instance.get_status_display()}",
        f"Consultation {instance.id} is now {instance.get_status_display()}.",
        url=f"/app/consultations/{instance.id}",
        related_app="consultations",
        related_id=instance.id,
    )


@receiver(post_save, sender=ConsultationMessage)
def on_consultation_message(sender, instance, created, **kwargs):
    if not created:
        return
    consultation = instance.consultation
    specialist_user = consultation.specialist.user if consultation.specialist else None
    participants = {p for p in (consultation.requested_by, specialist_user) if p}

    notify(
        instance.sender,
        "consultation_message",
        "Message sent",
        f"Your message was sent: {instance.body[:100]}",
        url=f"/app/consultations/{consultation.id}",
        related_app="consultations",
        related_id=consultation.id,
    )

    recipients = participants - {instance.sender}
    notify_many(
        recipients,
        "consultation_message",
        "New consultation message",
        instance.body[:140],
        url=f"/app/consultations/{consultation.id}",
        related_app="consultations",
        related_id=consultation.id,
    )


# ── Transport ────────────────────────────────────────────────────────────
def _driver_user_for(transport_request):
    """Resolve the actual assigned driver's user account via the
    Driver<->User link, if a vehicle (and thus a driver) is assigned."""
    vehicle = transport_request.vehicle
    if vehicle and vehicle.driver and vehicle.driver.user:
        return vehicle.driver.user
    return None


def _patient_user_for_transport(transport_request):
    """The transport is literally about getting this patient somewhere —
    they should know, if their portal account is linked."""
    referral = transport_request.referral
    if not referral:
        return None
    return getattr(referral.emergency_case.patient, "patient_user", None)


@receiver(post_save, sender=TransportRequest)
def on_transport_request_saved(sender, instance, created, **kwargs):
    actor = instance.requested_by
    assigned_driver_user = _driver_user_for(instance)
    patient_user = _patient_user_for_transport(instance)

    if created:
        if actor:
            notify(
                actor,
                "transport_new",
                "Transport request submitted",
                "Your transport request was submitted.",
                url=f"/app/transport/{instance.id}",
                related_app="transport",
                related_id=instance.id,
            )

        if patient_user:
            notify(
                patient_user,
                "transport_new",
                "Transport has been arranged for you",
                "A transport request has been submitted for your transfer.",
                url="/app/portal",
                related_app="transport",
                related_id=instance.id,
            )

        if assigned_driver_user:
            notify(
                assigned_driver_user,
                "transport_new",
                "New transport assignment",
                "You have been assigned a new transport request.",
                url=f"/app/transport/{instance.id}",
                related_app="transport",
                related_id=instance.id,
            )
        else:
            # Unassigned at creation — broadcast so any active driver can pick it up.
            recipients = list(User.objects.filter(role="driver", is_active=True))
            notify_many(
                recipients,
                "transport_new",
                "New transport request",
                "A new unassigned transport request needs a driver.",
                url=f"/app/transport/{instance.id}",
                related_app="transport",
                related_id=instance.id,
            )
        return

    recipients = [u for u in (actor, assigned_driver_user) if u]
    notify_many(
        recipients,
        "transport_status",
        f"Transport {instance.get_status_display()}",
        f"Transport request {instance.id} is now {instance.get_status_display()}.",
        url=f"/app/transport/{instance.id}",
        related_app="transport",
        related_id=instance.id,
    )
    if patient_user:
        notify(
            patient_user,
            "transport_status",
            f"Your transport is {instance.get_status_display()}",
            f"Your transport request is now {instance.get_status_display()}.",
            url="/app/portal",
            related_app="transport",
            related_id=instance.id,
        )


# ── Facility capacity ─────────────────────────────────────────────────────
@receiver(post_save, sender=FacilityCapacityLog)
def on_capacity_logged(sender, instance, created, **kwargs):
    if not created:
        return

    actor = instance.changed_by
    facility = instance.facility

    if actor:
        notify(
            actor,
            "capacity_updated",
            "Capacity updated",
            f"You updated capacity for {facility.name}.",
            url=f"/app/facilities/{facility.id}",
            related_app="facilities",
            related_id=facility.id,
        )

    # Capacity changes affect referral routing system-wide, so superadmins
    # are informed alongside the facility's own staff.
    recipients = list(_facility_staff(facility)) + list(_superadmins())
    if actor:
        recipients = [u for u in recipients if u.pk != actor.pk]
    notify_many(
        recipients,
        "capacity_updated",
        f"{facility.name} capacity updated",
        f"Capacity was updated for {facility.name}.",
        url=f"/app/facilities/{facility.id}",
        related_app="facilities",
        related_id=facility.id,
    )


# ── Patient service reviews ───────────────────────────────────────────────
@receiver(post_save, sender=PatientServiceReview)
def on_review_created(sender, instance, created, **kwargs):
    if not created:
        return

    notify(
        instance.patient,
        "review_new",
        "Thanks for your review",
        "Your service review was submitted.",
        url="/app/portal",
        related_app="accounts",
        related_id=instance.id,
    )

    # NOTE: facility_name is a plain text field on this model, not a real FK
    # to HealthFacility — this is a best-effort case-insensitive name match,
    # not a guaranteed link. If it doesn't match, only superadmins are informed.
    facility = None
    if instance.facility_name:
        facility = HealthFacility.objects.filter(
            name__iexact=instance.facility_name.strip()
        ).first()

    recipients = list(_superadmins())
    if facility:
        recipients += list(_facility_staff(facility, roles=("facility_admin", "health_worker")))

    notify_many(
        recipients,
        "review_new",
        "New patient review submitted",
        f"{instance.rating}\u2605 review for {instance.facility_name or 'a facility'} ({instance.visit_type}).",
        url="/app/patients",
        related_app="accounts",
        related_id=instance.id,
    )


# ── ANC visits ─────────────────────────────────────────────────────────────
@receiver(post_save, sender=ANCVisit)
def on_anc_visit_logged(sender, instance, created, **kwargs):
    if not created:
        return

    if instance.conducted_by:
        notify(
            instance.conducted_by,
            "anc_visit_logged",
            "ANC visit logged",
            f"You logged an ANC visit for {instance.patient}.",
            url=f"/app/patients/{instance.patient_id}",
            related_app="cases",
            related_id=instance.id,
        )

    patient_user = getattr(instance.patient, "patient_user", None)
    if patient_user:
        notify(
            patient_user,
            "anc_visit_logged",
            "Your ANC visit was recorded",
            f"Your antenatal care visit on {instance.visit_date} was recorded.",
            url="/app/portal",
            related_app="cases",
            related_id=instance.id,
        )


# ── Patient consent ─────────────────────────────────────────────────────────
@receiver(post_save, sender=PatientConsent)
def on_consent_recorded(sender, instance, created, **kwargs):
    if not created:
        return

    patient_user = getattr(instance.patient, "patient_user", None)
    if patient_user:
        notify(
            patient_user,
            "consent_recorded",
            "Consent updated",
            f"You {instance.action} consent for {instance.get_consent_type_display()}.",
            url="/app/portal",
            related_app="cases",
            related_id=instance.id,
        )

    if instance.recorded_by and instance.recorded_by != patient_user:
        notify(
            instance.recorded_by,
            "consent_recorded",
            "Consent recorded",
            f"You recorded a consent change for {instance.patient}.",
            url=f"/app/patients/{instance.patient_id}",
            related_app="cases",
            related_id=instance.id,
        )
