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


class FoodSecurityStatus(models.TextChoices):
    SECURE  = "secure",  "Secure"
    AT_RISK = "at_risk", "At Risk"
    INSECURE = "insecure", "Insecure"
    UNKNOWN = "unknown", "Unknown"


class Region(models.TextChoices):
    """Northern-belt regions the app currently targets. Feeds the
    location-aware local-food nutrition guidance (apps.wellness.content
    LOCAL_FOOD_BY_REGION) — kept as a controlled choice list rather than
    free-text `town` matching, since local staple availability varies by
    region in ways a curated table needs an exact key for."""
    NORTHERN    = "northern",     "Northern"
    NORTH_EAST  = "north_east",   "North East"
    SAVANNAH    = "savannah",     "Savannah"
    UPPER_EAST  = "upper_east",   "Upper East"
    UPPER_WEST  = "upper_west",   "Upper West"
    OTHER       = "other",        "Other / Outside Northern Belt"
    UNKNOWN     = "unknown",      "Unknown"


class Household(models.Model):
    """
    A compound/household grouping for patients registered at the same
    address — lets a health worker prioritise across an entire household
    (mother + children + other dependents) in one pass, rather than one
    patient record at a time.

    Aggregate risk and food-security status are read off this model by
    the household list views; the underlying clinical risk still lives
    on each member Patient, same as before.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    head_name = models.CharField(max_length=200, blank=True, default="")
    town      = models.CharField(max_length=100, blank=True)
    region    = models.CharField(
        max_length=15, choices=Region.choices, default=Region.UNKNOWN,
        help_text="Feeds the location-aware local-food nutrition guidance.",
    )
    latitude  = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)

    food_security_flag = models.CharField(
        max_length=10, choices=FoodSecurityStatus.choices, default=FoodSecurityStatus.UNKNOWN,
        help_text="Feeds the nutrition-guidance content engine for this household's children."
    )

    facility = models.ForeignKey(
        "facilities.HealthFacility",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="households",
    )
    created_by = models.ForeignKey(
        "accounts.User", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="created_households",
    )

    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Household — {self.head_name or self.id}"

    @property
    def is_deleted(self):
        return self.deleted_at is not None

    def soft_delete(self):
        self.deleted_at = timezone.now()
        self.save(update_fields=["deleted_at"])

    @property
    def aggregate_risk_level(self):
        """
        Max risk level across active members — mirrors RiskLevel ordering.
        Used to sort the household list so the highest-risk compound
        surfaces first, the same way individual patients sort today.
        """
        order = {RiskLevel.LOW: 0, RiskLevel.MEDIUM: 1, RiskLevel.HIGH: 2}
        levels = self.members.filter(deleted_at__isnull=True).values_list("risk_level", flat=True)
        if not levels:
            return RiskLevel.LOW
        return max(levels, key=lambda lvl: order.get(lvl, 0))


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

    # ── Patient type & household ────────────────────────────────────────
    # "maternal" (default, unchanged behaviour) vs "child" — a child record
    # skips obstetric fields and is the target of GrowthRecord / nutrition
    # content instead. household is optional so existing records are
    # unaffected; new registrations can attach to one at creation.
    PATIENT_TYPE_CHOICES = [("maternal", "Maternal"), ("child", "Child (under five)")]
    patient_type = models.CharField(max_length=10, choices=PATIENT_TYPE_CHOICES, default="maternal")
    household = models.ForeignKey(
        Household, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="members",
    )

    # ── Wellness Companion subtype ────────────────────────────────────────
    # Only meaningful when patient_type="maternal" AND patient_user is set
    # (i.e. an adult woman with a portal login). Distinguishes a pregnant
    # Maternal user (pregnancy tracker, household, transport, reviews, my
    # health) from a non-pregnant Wellness user (cycle tracking, adult
    # nutrition, paid "Consult" telehealth only). Mirrors
    # accounts.User.wellness_type, set at Patient-creation time. A "child"
    # patient_type record has no portal login and never sets this.
    WELLNESS_TYPE_CHOICES = [("maternal", "Maternal"), ("wellness", "Wellness")]
    wellness_type = models.CharField(max_length=10, choices=WELLNESS_TYPE_CHOICES, default="maternal")

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
        Call after each case, ANC visit, or growth record is saved.

        Branches by patient_type — a maternal patient and a child are
        risk-assessed on completely different clinical signals, so this
        just dispatches to the right one and does the shared save.
        """
        if self.patient_type == "child":
            flags, level = self._compute_child_risk()
        else:
            flags, level = self._compute_maternal_risk()
        self.risk_flags = flags
        self.risk_level = level
        self.save(update_fields=["risk_level", "risk_flags"])

    def _compute_maternal_risk(self):
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

        if len(flags) >= 3:
            level = RiskLevel.HIGH
        elif len(flags) >= 1:
            level = RiskLevel.MEDIUM
        else:
            level = RiskLevel.LOW
        return flags, level

    def _compute_child_risk(self):
        """
        Uses the most recent GrowthRecord's WHO MUAC acute-malnutrition
        classification (see GrowthRecord.muac_classification) — the same
        screening tool CHPS/health workers are already trained on, applied
        to a measurement they're already logging.

        Deliberately does NOT compute a weight-for-age or height-for-age
        classification — those require WHO growth-chart reference tables
        that aren't loaded in this system, and fabricating a percentile
        without them would be a real clinical claim this system can't
        back up. MUAC is the one indicator classifiable correctly from
        data actually on file.
        """
        latest = self.growth_records.order_by("-record_date").first()
        if not latest:
            return ["No growth records on file"], RiskLevel.LOW

        classification = latest.muac_classification
        if not classification:
            return (
                ["Growth record on file, but MUAC not classifiable "
                 "(missing measurement, date of birth, or outside the 6-59 month range)"],
                RiskLevel.LOW,
            )

        band = classification["band"]
        note = f"{classification['label']} (MUAC {latest.muac_cm}cm on {latest.record_date})"
        if band == "red":
            return [note], RiskLevel.HIGH
        if band == "yellow":
            return [note], RiskLevel.MEDIUM
        return [], RiskLevel.LOW


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


def classify_muac(muac_cm, age_months):
    """
    WHO mid-upper arm circumference (MUAC) acute-malnutrition bands —
    the standard field-screening tool for children 6-59 months.
    Deliberately returns None (not a guess) outside that validated age
    range, or when either input is missing — this is a widely-used
    screening threshold, not a diagnosis, and shouldn't be applied where
    the standard itself doesn't claim to apply.

        < 11.5 cm            → red    (Severe Acute Malnutrition)
        11.5 cm - < 12.5 cm  → yellow (Moderate Acute Malnutrition)
        >= 12.5 cm           → green  (Normal)
    """
    if muac_cm is None or age_months is None:
        return None
    if age_months < 6 or age_months > 59:
        return None
    if muac_cm < 11.5:
        return {"band": "red", "label": "Severe Acute Malnutrition"}
    if muac_cm < 12.5:
        return {"band": "yellow", "label": "Moderate Acute Malnutrition"}
    return {"band": "green", "label": "Normal"}


class GrowthRecord(models.Model):
    """
    Individual growth-monitoring entry for a child (patient_type="child").
    Append-only log, same pattern as ANCVisit — logged during a home
    visit or facility check, feeds the under-five nutrition content
    engine (apps/wellness) via the child's age-in-months and the
    household's food_security_flag.

    Acute-malnutrition classification (WHO MUAC red/yellow/green bands)
    is computed on demand via the muac_classification property below,
    and feeds Patient._compute_child_risk() — see that method for how
    a red/yellow band maps to Patient.risk_level.
    """
    id      = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="growth_records")

    record_date = models.DateField()
    weight_kg   = models.FloatField(null=True, blank=True)
    muac_cm     = models.FloatField(null=True, blank=True, help_text="Mid-upper arm circumference, cm")
    height_cm   = models.FloatField(null=True, blank=True)

    facility     = models.ForeignKey(
        "facilities.HealthFacility", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="growth_records"
    )
    recorded_by  = models.ForeignKey(
        "accounts.User", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="growth_records_recorded"
    )

    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-record_date"]

    def __str__(self):
        return f"Growth record — {self.patient} on {self.record_date}"

    @property
    def age_months_at_record(self):
        """Age in months AT THE TIME of this specific measurement — not
        the child's current age. A growth log spans months/years, so
        using today's age against an old record would misclassify it.
        Requires date_of_birth on file; falls back to None (not the
        coarser yearly `age` field, which can't be projected backward
        to a past date accurately enough for a clinical band)."""
        dob = self.patient.date_of_birth
        if not dob:
            return None
        days = (self.record_date - dob).days
        return max(0, days // 30)

    @property
    def muac_classification(self):
        return classify_muac(self.muac_cm, self.age_months_at_record)


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

    # Client-generated key (e.g. a UUID minted once per form submission) so a
    # retried request — from the offline queue, or a double-tap on a slow
    # connection — resolves to the same case instead of creating a duplicate
    # patient + case. Null for any case created before this existed.
    idempotency_key = models.CharField(max_length=64, null=True, blank=True, unique=True)

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
