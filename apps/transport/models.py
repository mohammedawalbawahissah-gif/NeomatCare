import uuid
from django.db import models
from django.conf import settings


# ─────────────────────────────────────────────
# DRIVER (OPTIONAL EXTENSION / CLARITY MODEL)
# ─────────────────────────────────────────────
class Driver(models.Model):
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )

    name = models.CharField(max_length=255)
    phone_number = models.CharField(max_length=20, blank=True)
    license_number = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "transport_driver"
        ordering = ["name"]

    def __str__(self):
        return self.name

# ─────────────────────────────────────────────
# VEHICLE MODEL
# ─────────────────────────────────────────────
class Vehicle(models.Model):

    class VehicleType(models.TextChoices):
        AMBULANCE  = "ambulance",  "Ambulance"
        CAR        = "car",        "Car (Uber/Bolt/Yango)"
        MOTORCYCLE = "motorcycle", "Motorcycle"
        TRICYCLE   = "tricycle",   "Tricycle (Yellow-Yellow/MotorKing)"
        TRUCK      = "truck",      "Truck"
        OTHER      = "other",      "Other"

    class Status(models.TextChoices):
        AVAILABLE   = "available",   "Available"
        IN_USE      = "in_use",      "In Use"
        MAINTENANCE = "maintenance", "Under Maintenance"
        INACTIVE    = "inactive",    "Inactive"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    registration = models.CharField(max_length=50, unique=True)

    vehicle_type = models.CharField(
        max_length=20,
        choices=VehicleType.choices,
        default=VehicleType.AMBULANCE
    )

    make  = models.CharField(max_length=100, blank=True)
    model = models.CharField(max_length=100, blank=True)
    year  = models.PositiveIntegerField(null=True, blank=True)

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.AVAILABLE
    )

    # DRIVER SELECTION (NOW BASED ON DRIVER MODEL)
    driver = models.ForeignKey(
        Driver,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="vehicles"
    )

    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "transport_vehicle"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.registration} ({self.vehicle_type})"


# ─────────────────────────────────────────────
# TRANSPORT REQUEST
# ─────────────────────────────────────────────
class TransportRequest(models.Model):

    class Status(models.TextChoices):
        PENDING   = "pending",   "Pending"
        ASSIGNED  = "assigned",  "Assigned"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    vehicle = models.ForeignKey(
        Vehicle,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="requests"
    )

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="transport_requests"
    )

    referral = models.ForeignKey(
        "referrals.Referral",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="transport_requests"
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING
    )

    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "transport_request"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Request {self.id} — {self.status}"