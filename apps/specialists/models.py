import uuid
from django.db import models
from django.conf import settings


class SpecialistProfile(models.Model):
    class Specialty(models.TextChoices):
        OBSTETRICS          = "obstetrics",         "Obstetrics"
        GYNECOLOGY          = "gynecology",          "Gynecology"
        NEONATOLOGY         = "neonatology",         "Neonatology"
        MIDWIFERY           = "midwifery",           "Midwifery"
        ANAESTHESIOLOGY     = "anaesthesiology",     "Anaesthesiology"
        INTERNAL_MEDICINE   = "internal_medicine",   "Internal Medicine"
        EMERGENCY_MEDICINE  = "emergency_medicine",  "Emergency Medicine"
        OTHER               = "other",               "Other"

    id                  = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user                = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="specialist_profile",
        limit_choices_to={"role": "specialist"},
    )
    professional_pin    = models.CharField(max_length=50, unique=True)
    specialty           = models.CharField(max_length=50, choices=Specialty.choices)
    years_experience    = models.PositiveIntegerField(default=0)
    qualification       = models.CharField(max_length=255, blank=True)
    whatsapp_number     = models.CharField(max_length=20, blank=True)
    is_available        = models.BooleanField(default=True)
    facility            = models.ForeignKey(
        "facilities.HealthFacility",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="specialists",
    )
    created_at          = models.DateTimeField(auto_now_add=True)
    updated_at          = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "specialists_profile"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user.name} — {self.specialty}"
