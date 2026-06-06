import uuid
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class UserManager(BaseUserManager):
    def create_user(self, email, name, password=None, role="health_worker", **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        user = self.model(email=email, name=name, role=role, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, name, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self.create_user(email, name, password, role="superadmin", **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        SUPERADMIN = "superadmin", "Super Admin"
        FACILTYADMIN      = "facility_admin",      "Facility Admin"
        HEALTHWORKER     = "health_worker",     "Health Worker"
        SPECIALIST = "specialist", "Specialist"
        DRIVER     = "driver",     "Driver"
        PATIENT    = "patient",   "Patient"

    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name       = models.CharField(max_length=255)
    email      = models.EmailField(unique=True)
    role       = models.CharField(max_length=20, choices=Role.choices, default=Role.HEALTHWORKER)
    facility   = models.ForeignKey(
        "facilities.HealthFacility",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="users",
    )
    is_active  = models.BooleanField(default=True)
    is_staff   = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    is_verified  = models.BooleanField(default=False, help_text="Email/SMS verified for patient portal accounts")
    phone_number = models.CharField(max_length=20, blank=True)

    USERNAME_FIELD  = "email"
    REQUIRED_FIELDS = ["name"]

    class Meta:
        db_table = "accounts_user"

    def __str__(self):
        return f"{self.name} ({self.role})"


import random
from django.utils import timezone
from datetime import timedelta


class OTPVerification(models.Model):
    class Channel(models.TextChoices):
        SMS   = "sms",   "SMS"
        EMAIL = "email", "Email"

    class Purpose(models.TextChoices):
        REGISTER = "register", "Registration"
        LOGIN    = "login",    "Login"
        RESET    = "reset",    "Password Reset"

    id       = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user     = models.ForeignKey(User, on_delete=models.CASCADE, related_name="otp_verifications")
    otp_code = models.CharField(max_length=6)
    channel  = models.CharField(max_length=5, choices=Channel.choices)
    purpose  = models.CharField(max_length=10, choices=Purpose.choices)
    is_used  = models.BooleanField(default=False)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]

    @classmethod
    def generate(cls, user, channel, purpose):
        """Create a new 6-digit OTP valid for 10 minutes, invalidating prior unused ones."""
        cls.objects.filter(user=user, purpose=purpose, is_used=False).update(is_used=True)
        code = str(random.randint(100000, 999999))
        return cls.objects.create(
            user=user,
            otp_code=code,
            channel=channel,
            purpose=purpose,
            expires_at=timezone.now() + timedelta(minutes=10),
        )

    @property
    def is_valid(self):
        return not self.is_used and timezone.now() < self.expires_at
