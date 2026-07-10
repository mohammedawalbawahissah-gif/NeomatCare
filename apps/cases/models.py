"""
apps/cases/models.py
--------------------
Models:
  Patient          — persistent patient identity, enriched with ANC history
  ANCVisit         — individual antenatal care visit log entries
  PatientConsent   — consent record for data use and patient portal
  EmergencyCase    — full clinical record for an obstetric/neonatal emergency
  TriageNote       — append-only incremental clinical notes on a case
"""
import uuid
from django.db import models
from django.utils import timezone


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
    A_POS   = "A+",      "A+"
    A_NEG   = "A-",      "A-"
    B_POS   = "B+",      "B+"
    B_NEG   = "B-",      "B-"
    AB_POS  = "AB+",     "AB+"
    AB_NEG  = "AB-",     "AB-"
    O_POS   = "O+",      "O+"
    O_NEG   = "O-",      "O-"
    UNKNOWN = "unknown", "Unknown"


VITAL_SIGNS_SCHEMA = {
    "systolic_bp":      int,
    "diastolic_bp":     int,
    "heart_rate":       int,
    "respiratory_rate": int,
    "temperature":      float,
    "spo2":             int,
}


class RiskLevel(models.TextChoices):
    LOW    = "low",    "Low"
    MEDIUM = "medium", "Medium"
    HIGH   = "high",   "High"


class Patient(models.Model):
    """
    Persistent patient identity record.

    A patient persists across pregnancies and facility visits.
    EmergencyCase.patient is a FK here — one patient can have
    many cases over time. Soft-delete only; never hard-delete.

    New fields vs original:
      - date_of_birth / expected_delivery_date — richer demographics
      - next_of_kin_* — contact for follow-up
      - risk_level — auto-computed or manually set
      - patient_user — optional link to a portal User account (role=patient)
      - notes — free-text background clinical notes
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # ── Identification ────────────────────────────────────────────────────
    patient_name         = models.CharField(max_length=200, blank=True, default="")
    hospital_id          = models.CharField(max_length=100, blank=True, default="", db_index=True)
    patient_phone_number = models.CharField(max_length=20, blank=True, default="")

    # ── Demographics ──────────────────────────────────────────────────────
    age         = models.PositiveIntegerField()
    date_of_birth = models.DateField(null=True, blank=True)
    town        = models.CharField(max_length=100, blank=True)
    blood_group = models.CharField(max_length=10, choices=BloodGroup.choices, default=BloodGroup.UNKNOWN)
    anc_visits  = models.PositiveIntegerField(default=0, help_text="Total ANC visits (auto-updated from ANCVisit log)")

    # ── Next of kin ───────────────────────────────────────────────────────
    next_of_kin_name         = models.CharField(max_length=200, blank=True)
    next_of_kin_phone        = models.CharField(max_length=20, blank=True)
    next_of_kin_relationship = models.CharField(max_length=100, blank=True)

    # ── Obstetric summary ─────────────────────────────────────────────────
    expected_delivery_date = models.DateField(null=True, blank=True)
    gravida = models.PositiveIntegerField(null=True, blank=True)
    parity  = models.PositiveIntegerField(null=True, blank=True)

    # ── Risk ──────────────────────────────────────────────────────────────
    risk_level = models.CharField(max_length=10, choices=RiskLevel.choices, default=RiskLevel.LOW)
    risk_flags = models.JSONField(default=list, help_text="List of risk flag strings computed from history")

    # ── Background notes ──────────────────────────────────────────────────
    notes = models.TextField(blank=True)

    # ── Portal link ───────────────────────────────────────────────────────
    patient_user = models.OneToOneField(
        "accounts.User",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="patient_profile",
        limit_choices_to={"role": "patient"},
    )

    # ── Consent ───────────────────────────────────────────────────────────
    # Convenience shortcut; full consent history is in PatientConsent
    consent_given    = models.BooleanField(default=False)
    consent_given_at = models.DateTimeField(null=True, blank=True)

    # ── Soft delete ───────────────────────────────────────────────────────
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    # ── Facility where first registered ──────────────────────────────────
    registered_at_facility = models.ForeignKey(
        "facilities.HealthFacility",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="registered_patients",
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.patient_name or 'Patient'} — age {self.age}"

    @property
    def is_deleted(self):
        return self.deleted_at is not None

    def soft_delete(self):
        self.deleted_at = timezone.now()
        self.save(update_fields=["deleted_at"])

    def compute_risk(self):
        """
        Compute risk_level and risk_flags from clinical signals.
        Call after each case or ANC visit is saved.
        """
        flags = []
        if self.parity and self.parity >= 5:
            flags.append("Grand multipara (parity ≥ 5)")
        if self.gravida and self.parity and self.gravida > self.parity + 1:
            flags.append("Previous pregnancy losses")
        if self.blood_group in ("A-", "B-", "AB-", "O-"):
            flags.append("Rhesus negative blood group")
        if self.anc_visits == 0 and self.expected_delivery_date:
            flags.append("No ANC visits recorded")
        # Count previous cases with high-risk danger signs
        high_risk_signs = {"PPH","APH","RUPTURED_UTERUS","ECLAMPSIA","SEVERE_PRE_ECLAMPSIA","CORD_PROLAPSE"}
        prior_high = sum(
            1 for case_signs in self.cases.values_list("danger_signs", flat=True)
            if case_signs and set(case_signs) & high_risk_signs
        )
        if prior_high > 0:
            flags.append("Prior emergency with high-risk danger sign")

        self.risk_flags = flags
        if len(flags) >= 3:
            self.risk_level = RiskLevel.HIGH
        elif len(flags) >= 1:
            self.risk_level = RiskLevel.MEDIUM
        else:
            self.risk_level = RiskLevel.LOW
        self.save(update_fields=["risk_level", "risk_flags"])


class ANCVisit(models.Model):
    """
    Individual antenatal care visit log entry for a patient.
    Each visit records gestational age, key observations, and any concerns.
    """
    id      = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="anc_visit_log")

    visit_date            = models.DateField()
    gestational_age_weeks = models.PositiveIntegerField(null=True, blank=True)
    facility              = models.ForeignKey(
        "facilities.HealthFacility", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="anc_visits"
    )
    conducted_by          = models.ForeignKey(
        "accounts.User", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="anc_visits_conducted"
    )

    weight_kg        = models.FloatField(null=True, blank=True)
    bp_systolic      = models.PositiveIntegerField(null=True, blank=True)
    bp_diastolic     = models.PositiveIntegerField(null=True, blank=True)
    fetal_heart_rate = models.PositiveIntegerField(null=True, blank=True)
    fundal_height_cm = models.FloatField(null=True, blank=True)

    notes    = models.TextField(blank=True)
    concerns = models.TextField(blank=True, help_text="Any clinical concerns noted at this visit")

    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-visit_date"]

    def __str__(self):
        return f"ANC visit — {self.patient} on {self.visit_date}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Keep Patient.anc_visits count in sync
        count = ANCVisit.objects.filter(patient=self.patient).count()
        Patient.objects.filter(pk=self.patient_id).update(anc_visits=count)


class PatientConsent(models.Model):
    """
    Immutable consent record. Each consent action creates a new row;
    never update or delete rows here. The latest row is the current state.
    """
    class ConsentType(models.TextChoices):
        DATA_USE    = "data_use",    "Data Use & Storage"
        PORTAL      = "portal",      "Patient Portal Access"
        SHARING     = "sharing",     "Facility Data Sharing"
        RESEARCH    = "research",    "Anonymised Research Use"

    class ConsentAction(models.TextChoices):
        GRANTED  = "granted",  "Granted"
        REVOKED  = "revoked",  "Revoked"
        UPDATED  = "updated",  "Updated"

    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient      = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="consents")
    consent_type = models.CharField(max_length=20, choices=ConsentType.choices)
    action       = models.CharField(max_length=10, choices=ConsentAction.choices)
    recorded_by  = models.ForeignKey(
        "accounts.User", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="consents_recorded"
    )
    notes     = models.TextField(blank=True)
    timestamp = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-timestamp"]

    def __str__(self):
        return f"{self.consent_type} {self.action} for {self.patient_id} at {self.timestamp:%Y-%m-%d}"


class EmergencyCase(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="cases")

    gestational_age_weeks = models.PositiveIntegerField(null=True, blank=True)
    gravida = models.PositiveIntegerField(null=True, blank=True)
    parity  = models.PositiveIntegerField(null=True, blank=True)
    obstetric_history = models.TextField(blank=True)

    presenting_complaint = models.TextField()
    danger_signs  = models.JSONField(default=list)
    vital_signs   = models.JSONField(default=dict, blank=True)
    fetal_heart_rate = models.PositiveIntegerField(null=True, blank=True)
    membranes_status = models.CharField(max_length=10, choices=MembranesStatus.choices, default=MembranesStatus.UNKNOWN)

    # Outcome recorded at case level (in addition to referral outcome)
    maternal_outcome = models.CharField(max_length=10, choices=[("survived","Survived"),("died","Died"),("unknown","Unknown")], default="unknown")
    neonatal_outcome = models.CharField(max_length=10, choices=[("survived","Survived"),("died","Died"),("unknown","Unknown")], default="unknown")
    outcome_notes    = models.TextField(blank=True)

    created_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="created_cases")
    referring_facility = models.ForeignKey("facilities.HealthFacility", on_delete=models.PROTECT, related_name="originated_cases")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "emergency case"
        verbose_name_plural = "emergency cases"
        indexes = [models.Index(fields=["referring_facility", "-created_at"])]

    def __str__(self):
        signs = ", ".join(self.danger_signs) if self.danger_signs else "no signs"
        return f"Case {self.id} — {signs}"


class TriageNote(models.Model):
    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    emergency_case = models.ForeignKey(EmergencyCase, on_delete=models.CASCADE, related_name="triage_notes")
    note       = models.TextField()
    created_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="triage_notes")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Note on {self.emergency_case_id} at {self.created_at:%H:%M}"
