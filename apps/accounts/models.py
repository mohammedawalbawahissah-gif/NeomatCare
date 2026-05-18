"""
apps/accounts/models.py
-----------------------
Custom User model. Must be set before the first migration via:
    AUTH_USER_MODEL = "accounts.User"

Roles
-----
- health_worker   : frontline staff — creates cases and referrals
- facility_admin  : manages a facility's capacity and incoming referrals
- superadmin      : full platform access, analytics, audit logs
"""
import uuid
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils import timezone

from .managers import UserManager


class Role(models.TextChoices):
    HEALTH_WORKER   = "health_worker",  "Health Worker"
    FACILITY_ADMIN  = "facility_admin", "Facility Admin"
    SUPERADMIN      = "superadmin",     "Superadmin"


class User(AbstractBaseUser, PermissionsMixin):
    """
    Platform user. Email is the login credential (no username field).
    The `facility` FK is nullable — superadmins are not tied to a facility.
    """
    id       = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name     = models.CharField(max_length=255)
    email    = models.EmailField(unique=True)
    role     = models.CharField(max_length=20, choices=Role.choices, default=Role.HEALTH_WORKER)

    # Nullable — superadmins have no home facility
    facility = models.ForeignKey(
        "facilities.HealthFacility",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="staff",
    )

    is_active   = models.BooleanField(default=True)
    is_staff    = models.BooleanField(default=False)   # Django admin access
    created_at  = models.DateTimeField(default=timezone.now)

    USERNAME_FIELD  = "email"
    REQUIRED_FIELDS = ["name"]

    objects = UserManager()

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "user"
        verbose_name_plural = "users"

    def __str__(self):
        return f"{self.name} ({self.role})"

    # ── Role helpers ──────────────────────────────────────────────────────
    @property
    def is_health_worker(self) -> bool:
        return self.role == Role.HEALTH_WORKER

    @property
    def is_facility_admin(self) -> bool:
        return self.role == Role.FACILITY_ADMIN

    @property
    def is_superadmin(self) -> bool:
        return self.role == Role.SUPERADMIN
