import uuid
from django.db import models
from django.conf import settings


class Vehicle(models.Model):
    class VehicleType(models.TextChoices):
        AMBULANCE   = "ambulance",   "Ambulance"
        CAR         = "car",         "Car"
        MOTORCYCLE  = "motorcycle",  "Motorcycle"
        TRUCK       = "truck",       "Truck"
        OTHER       = "other",       "Other"

    class Status(models.TextChoices):
        AVAILABLE   = "available",   "Available"
        IN_USE      = "in_use",      "In Use"
        MAINTENANCE = "maintenance", "Under Maintenance"
        INACTIVE    = "inactive",    "Inactive"

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    registration    = models.CharField(max_length=50, unique=True)
    vehicle_type    = models.CharField(max_length=20, choices=VehicleType.choices, default=VehicleType.AMBULANCE)
    make            = models.CharField(max_length=100, blank=True)
    model           = models.CharField(max_length=100, blank=True)
    year            = models.PositiveIntegerField(null=True, blank=True)
    status          = models.CharField(max_length=20, choices=Status.choices, default=Status.AVAILABLE)
    driver          = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="vehicles",
        limit_choices_to={"role": "driver"},
    )
    facility        = models.ForeignKey(
        "facilities.HealthFacility",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="vehicles",
    )
    notes           = models.TextField(blank=True)
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "transport_vehicle"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.registration} ({self.vehicle_type})"
