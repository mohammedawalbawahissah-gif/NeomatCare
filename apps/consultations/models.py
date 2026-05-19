"""
apps/consultations/models.py
----------------------------
Teleconsultation system.

Models
------
- SpecialistProfile  : extended profile for specialist users
- OnCallSchedule     : defines when a specialist is on call
- Consultation       : a teleconsultation session linked to a case
- ConsultationMessage: threaded messages within a consultation
"""
import uuid
from django.db import models
from django.utils import timezone


class Specialty(models.TextChoices):
    OBSTETRICS        = "obstetrics",         "Obstetrics"
    NEONATOLOGY       = "neonatology",        "Neonatology"
    ANAESTHESIOLOGY   = "anaesthesiology",    "Anaesthesiology"
    GENERAL_SURGERY   = "general_surgery",    "General Surgery"
    INTERNAL_MEDICINE = "internal_medicine",  "Internal Medicine"
    EMERGENCY_MEDICINE= "emergency_medicine", "Emergency Medicine"
    HAEMATOLOGY       = "haematology",        "Haematology"
    OTHER             = "other",              "Other"


class ConsultationStatus(models.TextChoices):
    REQUESTED  = "requested",  "Requested"
    ACCEPTED   = "accepted",   "Accepted"
    IN_PROGRESS= "in_progress","In Progress"
    COMPLETED  = "completed",  "Completed"
    DECLINED   = "declined",   "Declined"
    MISSED     = "missed",     "Missed"


class ConsultationChannel(models.TextChoices):
    VIDEO = "video", "Video Call"
    AUDIO = "audio", "Audio Call"
    TEXT  = "text",  "Text / Chat"


class Weekday(models.IntegerChoices):
    MONDAY    = 0, "Monday"
    TUESDAY   = 1, "Tuesday"
    WEDNESDAY = 2, "Wednesday"
    THURSDAY  = 3, "Thursday"
    FRIDAY    = 4, "Friday"
    SATURDAY  = 5, "Saturday"
    SUNDAY    = 6, "Sunday"


class SpecialistProfile(models.Model):
    """
    Extended profile for users with role='specialist'.
    One-to-one with the User model.
    """
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user        = models.OneToOneField(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="specialist_profile",
        limit_choices_to={"role": "specialist"},
    )
    specialty        = models.CharField(max_length=30, choices=Specialty.choices)
    qualification    = models.CharField(max_length=255, blank=True, help_text="E.g. MBChB, FWACS")
    years_experience = models.PositiveIntegerField(default=0)
    bio              = models.TextField(blank=True)
    is_available     = models.BooleanField(default=True, help_text="Currently accepting consultations")
    created_at       = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["specialty", "user__name"]

    def __str__(self):
        return f"Dr. {self.user.name} — {self.get_specialty_display()}"


class OnCallSchedule(models.Model):
    """
    Defines a recurring on-call window for a specialist.
    E.g. Monday 08:00–17:00.
    """
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    specialist = models.ForeignKey(
        SpecialistProfile,
        on_delete=models.CASCADE,
        related_name="schedules",
    )
    weekday    = models.IntegerField(choices=Weekday.choices)
    start_time = models.TimeField()
    end_time   = models.TimeField()
    is_active  = models.BooleanField(default=True)

    class Meta:
        ordering = ["weekday", "start_time"]
        unique_together = [["specialist", "weekday", "start_time"]]

    def __str__(self):
        return f"{self.specialist} — {self.get_weekday_display()} {self.start_time}–{self.end_time}"


class Consultation(models.Model):
    """
    A teleconsultation session between a health worker and a specialist,
    triggered by an emergency case.
    """
    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    emergency_case = models.ForeignKey(
        "cases.EmergencyCase",
        on_delete=models.CASCADE,
        related_name="consultations",
    )
    requested_by   = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="consultations_requested",
    )
    specialist     = models.ForeignKey(
        SpecialistProfile,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="consultations",
    )

    channel        = models.CharField(max_length=10, choices=ConsultationChannel.choices, default=ConsultationChannel.TEXT)
    status         = models.CharField(max_length=20, choices=ConsultationStatus.choices, default=ConsultationStatus.REQUESTED)

    # Clinical notes added by specialist at end of consultation
    specialist_notes = models.TextField(blank=True)
    recommendation   = models.TextField(blank=True, help_text="Clinical recommendation / management plan")

    # Timing
    requested_at   = models.DateTimeField(default=timezone.now)
    accepted_at    = models.DateTimeField(null=True, blank=True)
    started_at     = models.DateTimeField(null=True, blank=True)
    ended_at       = models.DateTimeField(null=True, blank=True)

    # For video/audio — store a generated room token/ID
    room_id        = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-requested_at"]

    def __str__(self):
        return f"Consultation {self.id} — {self.get_status_display()}"

    @property
    def duration_minutes(self):
        if self.started_at and self.ended_at:
            delta = self.ended_at - self.started_at
            return round(delta.total_seconds() / 60)
        return None


class ConsultationMessage(models.Model):
    """
    A single message in the text channel of a consultation.
    Used for async text consultations and chat alongside video.
    """
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    consultation = models.ForeignKey(
        Consultation,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    sender       = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="consultation_messages",
    )
    body         = models.TextField()
    sent_at      = models.DateTimeField(default=timezone.now)
    is_system    = models.BooleanField(default=False, help_text="System-generated message (e.g. status change)")

    class Meta:
        ordering = ["sent_at"]

    def __str__(self):
        return f"Message from {self.sender} at {self.sent_at:%H:%M}"
