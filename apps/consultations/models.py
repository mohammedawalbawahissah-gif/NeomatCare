import uuid
from django.db import models
from django.conf import settings


class SpecialistProfile(models.Model):
    class Specialty(models.TextChoices):
        OBSTETRICS         = "obstetrics",        "Obstetrics"
        GYNECOLOGY         = "gynecology",         "Gynecology"
        NEONATOLOGY        = "neonatology",        "Neonatology"
        MIDWIFERY          = "midwifery",          "Midwifery"
        ANAESTHESIOLOGY    = "anaesthesiology",    "Anaesthesiology"
        INTERNAL_MEDICINE  = "internal_medicine",  "Internal Medicine"
        EMERGENCY_MEDICINE = "emergency_medicine", "Emergency Medicine"
        OTHER              = "other",              "Other"

    id               = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user             = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="specialist_profile",
        limit_choices_to={"role": "specialist"},
    )
    # Standalone fields used when no system user account is linked yet
    display_name      = models.CharField(max_length=255, blank=True)
    specialist_phone  = models.CharField(max_length=20, blank=True)
    specialist_email  = models.EmailField(blank=True)
    bio               = models.TextField(blank=True)
    emergency_contact = models.CharField(max_length=20, blank=True)

    professional_pin = models.CharField(max_length=50, unique=True)
    specialty        = models.CharField(max_length=50, choices=Specialty.choices)
    years_experience = models.PositiveIntegerField(default=0)
    qualification    = models.CharField(max_length=255, blank=True)
    whatsapp_number  = models.CharField(max_length=20, blank=True)
    is_available     = models.BooleanField(default=True)
    facility         = models.ForeignKey(
        "facilities.HealthFacility",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="specialists",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def resolved_name(self):
        return self.user.name if self.user else self.display_name

    class Meta:
        db_table = "consultations_specialist_profile"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.resolved_name} — {self.specialty}"


class Consultation(models.Model):
    class Status(models.TextChoices):
        PENDING   = "pending",   "Pending"
        ACTIVE    = "active",    "Active"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    specialist = models.ForeignKey(SpecialistProfile, null=True, blank=True, on_delete=models.SET_NULL, related_name="consultations")
    referral   = models.ForeignKey("referrals.Referral", null=True, blank=True, on_delete=models.SET_NULL, related_name="consultations")
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="consultation_requests")
    status     = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    notes      = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "consultations_consultation"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Consultation {self.id} — {self.status}"


class ConsultationMessage(models.Model):
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    consultation = models.ForeignKey(Consultation, on_delete=models.CASCADE, related_name="messages")
    sender       = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="consultation_messages")
    body         = models.TextField()
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "consultations_message"
        ordering = ["created_at"]

    def __str__(self):
        return f"Message in {self.consultation_id} by {self.sender}"
