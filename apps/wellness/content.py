"""
apps/wellness/content.py
--------------------------
Monthly, weekly, and daily pregnancy guidance — all derived from the
SAME trimester tips/danger-signs already reviewed and shipped in the
patient portal (see TRIMESTERS in src/pages/patients/PatientPortalPage.jsx
on the frontend). This module does not invent new clinical claims; it
re-slices the existing vetted content into finer granularity and adds
a handful of widely-known, uncontroversial standard obstetric
milestones (anatomy scan, viability, glucose screening, GBS test,
full term) that are standard patient education, not specific medical
advice.

If you want genuinely distinct week-by-week clinical content beyond
this re-slicing, that content should be authored/reviewed by a
clinician before shipping — this module deliberately does not
fabricate detailed fetal-development claims per week.
"""

TRIMESTERS = [
    {
        "range": (1, 12),
        "title": "First Trimester",
        "tips": [
            "Attend your first antenatal care (ANC) visit as early as possible.",
            "Start folic acid supplements (400 mcg/day) to prevent neural tube defects.",
            "Avoid alcohol, tobacco, and unprescribed medications.",
            "Eat small, frequent meals to manage nausea.",
            "Stay hydrated — aim for 8-10 glasses of water daily.",
            "Rest as much as possible; fatigue is normal.",
        ],
        "danger": [
            "Heavy vaginal bleeding",
            "Severe abdominal cramps",
            "High fever (above 38°C)",
            "Fainting or loss of consciousness",
        ],
    },
    {
        "range": (13, 27),
        "title": "Second Trimester",
        "tips": [
            "Continue ANC visits — typically monthly during this period.",
            "Sleep on your left side to improve blood flow to baby.",
            "Eat iron-rich foods (beans, dark greens, lean meat) to prevent anaemia.",
            "Take iron and folate supplements as prescribed.",
            "Start monitoring baby movements after week 20.",
            "Avoid standing for long periods without rest.",
        ],
        "danger": [
            "No foetal movement felt after week 20",
            "Sudden swelling of face, hands, or feet",
            "Severe headache or blurred vision",
            "Vaginal bleeding of any amount",
            "Pain or burning when urinating",
        ],
    },
    {
        "range": (28, 42),
        "title": "Third Trimester",
        "tips": [
            "Increase ANC visit frequency — every two weeks after week 28, weekly from week 36.",
            "Count baby kicks daily — at least 10 movements in 2 hours.",
            "Prepare your delivery bag early (week 35-36).",
            "Discuss your birth plan with your health worker.",
            "Watch for signs of pre-eclampsia (headache, visual changes, upper-belly pain).",
            "Arrange transport to the facility in advance.",
        ],
        "danger": [
            "Decreased or absent foetal movement",
            "Severe or sudden headache",
            "Blurred or double vision",
            "Swelling of face and hands",
            "Fluid gushing from vagina (ruptured membranes)",
            "Contractions before 37 weeks",
            "Heavy bleeding",
        ],
    },
]

# A handful of widely-known, standard obstetric milestones — general
# patient education, not specific medical claims.
WEEK_MILESTONES = {
    12: "Many clinics offer a first-trimester dating scan around now.",
    18: "An anatomy/anomaly scan is commonly offered between weeks 18-22.",
    20: "This is the commonly cited viability-adjacent midpoint — a good time to start a daily kick-count habit.",
    24: "Glucose screening for gestational diabetes is commonly offered between weeks 24-28.",
    28: "Third-trimester ANC visits typically increase in frequency from here.",
    36: "Group B Strep (GBS) testing is commonly offered between weeks 35-37 in some settings.",
    37: "Weeks 37-42 are considered full term.",
}

DAILY_FOCUS_ROTATION = [
    {"focus": "hydration",    "prompt": "Remind the patient to stay hydrated today — 8-10 glasses of water."},
    {"focus": "movement",     "prompt": "Encourage a gentle 15-20 minute walk today if they feel well."},
    {"focus": "nutrition",    "prompt": "Suggest an iron-rich food idea for today (beans, leafy greens, lean meat)."},
    {"focus": "danger_check", "prompt": "Gently prompt a self-check against their current trimester's danger signs."},
    {"focus": "rest",         "prompt": "Remind them to rest, ideally on their left side."},
    {"focus": "mental_health","prompt": "Offer a brief, warm check-in on how they're feeling emotionally today."},
    {"focus": "anc_reminder", "prompt": "Remind them to keep up with their ANC visit schedule."},
]


def get_trimester_for_week(week: int) -> dict:
    for t in TRIMESTERS:
        lo, hi = t["range"]
        if lo <= week <= hi:
            return t
    return TRIMESTERS[-1] if week > TRIMESTERS[-1]["range"][1] else TRIMESTERS[0]


def get_monthly_content(pregnancy_month: int) -> dict:
    """pregnancy_month: 1-10 (lunar months, ~4 weeks each)."""
    approx_week = min(max(pregnancy_month * 4 - 2, 1), 42)
    trimester = get_trimester_for_week(approx_week)
    return {
        "month": pregnancy_month,
        "trimester_title": trimester["title"],
        "tips": trimester["tips"],
        "danger_signs": trimester["danger"],
    }


def get_weekly_content(week: int) -> dict:
    trimester = get_trimester_for_week(week)
    return {
        "week": week,
        "trimester_title": trimester["title"],
        "tips": trimester["tips"],
        "danger_signs": trimester["danger"],
        "milestone": WEEK_MILESTONES.get(week),
    }


def get_daily_focus(day_of_pregnancy: int) -> dict:
    return DAILY_FOCUS_ROTATION[day_of_pregnancy % len(DAILY_FOCUS_ROTATION)]
