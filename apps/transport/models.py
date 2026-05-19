"""
apps/transport/models.py
------------------------
Transport registry and dispatch system.

Models
------
- Transport        : a vehicle in the fleet (own or external)
- TransportRequest : a dispatch request linking a case to a vehicle
"""
import uuid
from django.db import models
from django.utils import timezone


class TransportType(models.TextChoices):
    AMBULANCE        = "ambulance",        "Ambulance"
    MOTORBIKE        = "motorbike",        "Motorbike"
    COMMUNITY_VEHICLE= "community_vehicle","Community Vehicle"
    BOAT             = "boat",             "Boat"
    HELICOPTER       = "helicopter",       "Helicopter"
    EXTERNAL         = "external",         "External Service"


class TransportOwnership(models.TextChoices):
    OWN      = "own",      "Own Fleet"
    EXTERNAL = "external", "External"


class TransportStatus(models.TextChoices):
    AVAILABLE   = "available",   "Available"
    DISPATCHED  = "dispatched",  "Dispatched"
    RETURNING   = "returning",   "Returning"
    MAINTENANCE = "maintenance", "Under Maintenance"
    OFFLINE     = "offline",     "Offline"


class RequestStatus(models.TextChoices):
    REQUESTED  = "requested",  "Requested"
    ACCEPTED   = "accepted",   "Accepted"
    DISPATCHED = "dispatched", "Dispatched"
    ARRIVED    = "arrived",    "Arrived at Patient"
    COMPLETED  = "completed",  "Completed"
    CANCELLED  = "cancelled",  "Cancelled"


class Transport(models.Model):
    """
    A vehicle or transport resource available for emergency dispatch.
    Can be part of the facility's own fleet or an external provider.
    """
    id            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name          = models.CharField(max_length=255, help_text="E.g. 'Ambulance 01', 'Rider Kofi'")
    transport_type = models.CharField(max_length=30, choices=TransportType.choices)
    ownership     = models.CharField(max_length=20, choices=TransportOwnership.choices, default=TransportOwnership.OWN)

    # For own fleet — linked to a facility
    facility      = models.ForeignKey(
        "facilities.HealthFacility",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="transport_fleet",
    )

    # For external — provider name e.g. "NHIA Ambulance Service"
    provider_name = models.CharField(max_length=255, blank=True)

    # Driver / operator
    driver        = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="assigned_transport",
        limit_choices_to={"role": "driver"},
    )
    driver_phone  = models.CharField(max_length=20, blank=True)

    # Current state
    status        = models.CharField(max_length=20, choices=TransportStatus.choices, default=TransportStatus.AVAILABLE)

    # Last known GPS position
    latitude      = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude     = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    location_updated_at = models.DateTimeField(null=True, blank=True)

    notes         = models.TextField(blank=True)
    is_active     = models.BooleanField(default=True)
    created_at    = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["transport_type", "name"]

    def __str__(self):
        return f"{self.name} ({self.get_transport_type_display()}) — {self.get_status_display()}"


class TransportRequest(models.Model):
    """
    A dispatch request created when a health worker needs transport
    for an emergency case.
    """
    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    emergency_case  = models.ForeignKey(
        "cases.EmergencyCase",
        on_delete=models.CASCADE,
        related_name="transport_requests",
    )
    transport       = models.ForeignKey(
        Transport,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="requests",
    )
    requested_by    = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="transport_requests_made",
    )

    status          = models.CharField(max_length=20, choices=RequestStatus.choices, default=RequestStatus.REQUESTED)

    # Pickup and destination
    pickup_facility = models.ForeignKey(
        "facilities.HealthFacility",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="transport_pickups",
    )
    destination_facility = models.ForeignKey(
        "facilities.HealthFacility",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="transport_destinations",
    )

    # Free-text destination for community pickups
    pickup_notes    = models.TextField(blank=True)

    # Timing
    requested_at    = models.DateTimeField(default=timezone.now)
    accepted_at     = models.DateTimeField(null=True, blank=True)
    arrived_at      = models.DateTimeField(null=True, blank=True)
    completed_at    = models.DateTimeField(null=True, blank=True)

    estimated_minutes = models.PositiveIntegerField(null=True, blank=True)
    driver_notes    = models.TextField(blank=True)

    class Meta:
        ordering = ["-requested_at"]

    def __str__(self):
        return f"Transport request for case {self.emergency_case_id} — {self.get_status_display()}"
