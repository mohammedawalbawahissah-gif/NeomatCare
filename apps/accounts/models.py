import uuid
import random
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


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
        SUPERADMIN   = "superadmin",     "Super Admin"
        FACILTYADMIN = "facility_admin", "Facility Admin"
        HEALTHWORKER = "health_worker",  "Health Worker"
        SPECIALIST   = "specialist",     "Specialist"
        DRIVER       = "driver",         "Driver"
        PATIENT      = "patient",        "Patient"

    id       = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name     = models.CharField(max_length=255)
    email    = models.EmailField(unique=True)
    phone_number = models.CharField(max_length=20, blank=True, default="")
    role     = models.CharField(max_length=20, choices=Role.choices, default=Role.HEALTHWORKER)
    facility = models.ForeignKey(
        "facilities.HealthFacility",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="users",
    )
    is_active  = models.BooleanField(default=True)
    is_staff   = models.BooleanField(default=False)
    # Email/phone verified flag — set True after OTP confirmed
    is_verified = models.BooleanField(default=False)
    # Expo push notification token registered by the mobile app.
    # Format: ExponentPushToken[xxxx]. Set automatically on login/PushTokenView.
    expo_push_token = models.CharField(max_length=200, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD  = "email"
    REQUIRED_FIELDS = ["name"]

    class Meta:
        db_table = "accounts_user"

    def __str__(self):
        return f"{self.name} ({self.role})"


class OTPVerification(models.Model):
    """
    One-time passcode used to verify email or phone during registration.
    All non-superadmin roles must verify before their account is activated.
    """
    class Channel(models.TextChoices):
        SMS   = "sms",   "SMS"
        EMAIL = "email", "Email"

    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user       = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="otp_verifications"
    )
    code       = models.CharField(max_length=6)
    channel    = models.CharField(max_length=5, choices=Channel.choices, default=Channel.SMS)
    is_used    = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        db_table = "accounts_otp_verification"
        ordering = ["-created_at"]

    @classmethod
    def generate(cls, user, channel):
        """Create a fresh 6-digit OTP valid for 10 minutes."""
        # Invalidate all prior unused codes for this user
        cls.objects.filter(user=user, is_used=False).update(is_used=True)
        code = str(random.randint(100000, 999999))
        return cls.objects.create(
            user=user,
            code=code,
            channel=channel,
            expires_at=timezone.now() + timezone.timedelta(minutes=10),
        )

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    def __str__(self):
        return f"OTP for {self.user.email} via {self.channel}"


class PatientServiceReview(models.Model):
    """
    Pre- or post-labour service satisfaction rating submitted via the patient portal.
    """
    class VisitType(models.TextChoices):
        ANC        = "anc",        "Antenatal Care (ANC)"
        DELIVERY   = "delivery",   "Delivery"
        POSTNATAL  = "postnatal",  "Postnatal Visit"
        EMERGENCY  = "emergency",  "Emergency Visit"
        TRANSPORT  = "transport",  "Transport Service"
        OTHER      = "other",      "Other"

    class Period(models.TextChoices):
        PRE_LABOUR  = "pre_labour",  "Pre-Labour"
        POST_LABOUR = "post_labour", "Post-Labour"

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient     = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="service_reviews",
        limit_choices_to={"role": "patient"},
    )
    visit_type  = models.CharField(max_length=20, choices=VisitType.choices)
    period      = models.CharField(max_length=15, choices=Period.choices, default=Period.PRE_LABOUR)
    facility_name = models.CharField(max_length=255, blank=True)
    rating      = models.PositiveSmallIntegerField(help_text="1–5 stars")
    comments    = models.TextField(blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "accounts_patient_service_review"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Review by {self.patient.name} — {self.rating}★ ({self.visit_type})"
