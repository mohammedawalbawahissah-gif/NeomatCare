"""
apps/cases/models.py
--------------------
Models:
  Patient       — de-identified patient record (PHI isolated here)
  EmergencyCase — full clinical record for an obstetric/neonatal emergency
  TriageNote    — append-only incremental clinical notes on a case

Design notes:
  - Patient is separated from EmergencyCase so PHI stays isolated.
    Analytics queries can join on EmergencyCase without touching Patient.
  - danger_signs stores a list of DangerSign code strings (from referral_engine.py).
    The referral engine reads these directly to compute requirements.
  - vital_signs is a JSONField with a known schema — see VITAL_SIGNS_SCHEMA below.
  - TriageNote is append-only: health workers add notes without editing the
    main case record, mirroring real clinical documentation practice.
"""
import uuid
from django.db import models
from django.utils import timezone


# ── Danger signs taxonomy ─────────────────────────────────────────────────
# These codes must match DangerSign enum values in referral_engine.py.
# Stored as a JSONField list on EmergencyCase.danger_signs.
class DangerSign(models.TextChoices):
    PPH                  = "PPH",                  "Postpartum Haemorrhage"
    APH                  = "APH",                  "Antepartum Haemorrhage"
    RUPTURED_UTERUS      = "RUPTURED_UTERUS",      "Ruptured Uterus"
    ECLAMPSIA            = "ECLAMPSIA",             "Eclampsia"
    SEVERE_PRE_ECLAMPSIA = "SEVERE_PRE_ECLAMPSIA",  "Severe Pre-Eclampsia"
    OBSTRUCTED_LABOUR    = "OBSTRUCTED_LABOUR",     "Obstructed Labour"
    CORD_PROLAPSE        = "CORD_PROLAPSE",         "Cord Prolapse"
    PUERPERAL_SEPSIS     = "PUERPERAL_SEPSIS",      "Puerperal Sepsis"
    CHORIOAMNIONITIS     = "CHORIOAMNIONITIS",       "Chorioamnionitis"
    NEONATAL_DISTRESS    = "NEONATAL_DISTRESS",     "Neonatal Distress"
    PRETERM_LABOUR       = "PRETERM_LABOUR",        "Preterm Labour"
    NEONATAL_SEPSIS      = "NEONATAL_SEPSIS",       "Neonatal Sepsis"
    SEVERE_ANAEMIA       = "SEVERE_ANAEMIA",        "Severe Anaemia"
    MALPRESENTATION      = "MALPRESENTATION",       "Malpresentation"


class MembranesStatus(models.TextChoices):
    INTACT   = "intact",   "Intact"
    RUPTURED = "ruptured", "Ruptured"
    UNKNOWN  = "unknown",  "Unknown"


class BloodGroup(models.TextChoices):
    A_POS  = "A+",  "A+"
    A_NEG  = "A-",  "A-"
    B_POS  = "B+",  "B+"
    B_NEG  = "B-",  "B-"
    AB_POS = "AB+", "AB+"
    AB_NEG = "AB-", "AB-"
    O_POS  = "O+",  "O+"
    O_NEG  = "O-",  "O-"
    UNKNOWN = "unknown", "Unknown"


# ── Expected shape of vital_signs JSONField ───────────────────────────────
# Documented here for frontend/API consumers.
# {
#   "systolic_bp":  120,   # mmHg
#   "diastolic_bp":  80,   # mmHg
#   "heart_rate":    88,   # bpm
#   "respiratory_rate": 18, # breaths/min
#   "temperature":  37.2, # °C
#   "spo2":         98,   # %
# }
VITAL_SIGNS_SCHEMA = {
    "systolic_bp":      int,
    "diastolic_bp":     int,
    "heart_rate":       int,
    "respiratory_rate": int,
    "temperature":      float,
    "spo2":             int,
}


class Patient(models.Model):
    """
    De-identified patient record.

    No name, no national ID, no phone number — only the minimum clinical
    and demographic data needed for care and analytics.

    Soft-delete via deleted_at: set this field to now() to remove the
    patient from all active queries. Never hard-delete patient records.
    """
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    age         = models.PositiveIntegerField()
    district    = models.CharField(max_length=100, blank=True)
    blood_group = models.CharField(
        max_length=10,
        choices=BloodGroup.choices,
        default=BloodGroup.UNKNOWN,
    )
    anc_visits  = models.PositiveIntegerField(
        default=0,
        help_text="Number of antenatal care visits completed before this emergency.",
    )
    # Soft delete — never hard-delete patient records
    deleted_at  = models.DateTimeField(null=True, blank=True)
    created_at  = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Patient {self.id} — age {self.age}"

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    def soft_delete(self):
        self.deleted_at = timezone.now()
        self.save(update_fields=["deleted_at"])


class EmergencyCase(models.Model):
    """
    Clinical record for an obstetric or neonatal emergency.

    This is the central model — it feeds the referral engine and anchors
    the full referral lifecycle. Once created, the core clinical fields
    should not be edited; use TriageNote for incremental documentation.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # ── Patient link ──────────────────────────────────────────────────────
    patient = models.ForeignKey(
        Patient,
        on_delete=models.PROTECT,   # never cascade-delete a case
        related_name="cases",
    )

    # ── Obstetric history ─────────────────────────────────────────────────
    gestational_age_weeks = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Gestational age in completed weeks.",
    )
    gravida = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Total number of pregnancies including current.",
    )
    parity  = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Number of deliveries at or beyond 20 weeks.",
    )
    obstetric_history = models.TextField(
        blank=True,
        help_text="Relevant prior complications, surgeries, or notes.",
    )

    # ── Presenting complaint and danger signs ─────────────────────────────
    presenting_complaint = models.TextField(
        help_text="Chief complaint in the health worker's own words.",
    )
    # List of DangerSign code strings — read directly by the referral engine
    # e.g. ["PPH", "SEVERE_ANAEMIA"]
    danger_signs = models.JSONField(
        default=list,
        help_text="List of recognised danger sign codes.",
    )

    # ── Vital signs ───────────────────────────────────────────────────────
    # Stored as JSON to allow partial recording (not all vitals may be available)
    vital_signs = models.JSONField(
        default=dict,
        blank=True,
        help_text=(
            "Keys: systolic_bp, diastolic_bp, heart_rate, "
            "respiratory_rate, temperature, spo2"
        ),
    )
    fetal_heart_rate = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Fetal heart rate in beats per minute.",
    )
    membranes_status = models.CharField(
        max_length=10,
        choices=MembranesStatus.choices,
        default=MembranesStatus.UNKNOWN,
    )

    # ── Origin ────────────────────────────────────────────────────────────
    created_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.PROTECT,
        related_name="created_cases",
    )
    referring_facility = models.ForeignKey(
        "facilities.HealthFacility",
        on_delete=models.PROTECT,
        related_name="originated_cases",
    )
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "emergency case"
        verbose_name_plural = "emergency cases"
        indexes = [
            models.Index(fields=["referring_facility", "-created_at"]),
        ]

    def __str__(self):
        signs = ", ".join(self.danger_signs) if self.danger_signs else "no signs recorded"
        return f"Case {self.id} — {signs}"


class TriageNote(models.Model):
    """
    Append-only incremental clinical note on an EmergencyCase.

    Health workers add notes as a case evolves without editing the
    original case record — mirrors real nursing/clinical documentation.
    Never update or delete triage notes.
    """
    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    emergency_case = models.ForeignKey(
        EmergencyCase,
        on_delete=models.CASCADE,
        related_name="triage_notes",
    )
    note       = models.TextField()
    created_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.PROTECT,
        related_name="triage_notes",
    )
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["created_at"]   # chronological order

    def __str__(self):
        return f"Note on case {self.emergency_case_id} at {self.created_at:%H:%M}"
