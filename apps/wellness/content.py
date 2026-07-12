"""
apps/wellness/content.py
--------------------------
Nutrition, lifestyle, and danger-sign guidance at FOUR granularities:
trimester, monthly, weekly, and daily. All content is grounded in the
same trimester-level guidance already reviewed and shipped in the
patient portal — this module splits it into nutrition/lifestyle
categories and re-slices it into finer granularity, rather than
inventing new clinical claims. It also adds a handful of widely-known,
uncontroversial standard obstetric milestones (anatomy scan,
viability, glucose screening, GBS test, full term) that are standard
patient education, not specific medical advice.

If you want genuinely distinct week-by-week clinical content beyond
this re-slicing, that content should be authored/reviewed by a
clinician before shipping — this module deliberately does not
fabricate detailed fetal-development claims per week.
"""

TRIMESTERS = [
    {
        "range": (1, 12),
        "title": "First Trimester",
        "nutrition": [
            "Start folic acid supplements (400 mcg/day) to prevent neural tube defects.",
            "Eat small, frequent meals to manage nausea.",
            "Stay hydrated — aim for 8-10 glasses of water daily.",
            "Ginger tea or crackers can help settle morning sickness.",
        ],
        "lifestyle": [
            "Attend your first antenatal care (ANC) visit as early as possible.",
            "Avoid alcohol, tobacco, and unprescribed medications.",
            "Rest as much as possible; fatigue is normal.",
            "Avoid heavy lifting or strenuous exercise without your health worker's advice.",
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
        "nutrition": [
            "Eat iron-rich foods (beans, dark greens, lean meat) to prevent anaemia.",
            "Take iron and folate supplements as prescribed.",
            "Include calcium-rich foods (milk, small fish with bones) for bone development.",
            "Continue eating small, regular meals to maintain energy.",
        ],
        "lifestyle": [
            "Continue ANC visits — typically monthly during this period.",
            "Sleep on your left side to improve blood flow to baby.",
            "Start monitoring baby movements after week 20.",
            "Avoid standing for long periods without rest.",
            "Gentle daily walks are usually safe and beneficial — confirm with your health worker.",
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
        "nutrition": [
            "Continue iron and calcium intake — baby's growth accelerates now.",
            "Eat smaller, more frequent meals if you feel full quickly.",
            "Stay well hydrated, especially in hot weather.",
        ],
        "lifestyle": [
            "Increase ANC visit frequency — every two weeks after week 28, weekly from week 36.",
            "Count baby kicks daily — at least 10 movements in 2 hours.",
            "Prepare your delivery bag early (week 35-36).",
            "Discuss your birth plan with your health worker.",
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
    20: "This is a commonly cited midpoint — a good time to start a daily kick-count habit.",
    24: "Glucose screening for gestational diabetes is commonly offered between weeks 24-28.",
    28: "Third-trimester ANC visits typically increase in frequency from here.",
    36: "Group B Strep (GBS) testing is commonly offered between weeks 35-37 in some settings.",
    37: "Weeks 37-42 are considered full term.",
}


def get_trimester_for_week(week: int) -> dict:
    for t in TRIMESTERS:
        lo, hi = t["range"]
        if lo <= week <= hi:
            return t
    return TRIMESTERS[-1] if week > TRIMESTERS[-1]["range"][1] else TRIMESTERS[0]


def get_trimester_content(week: int) -> dict:
    """Full trimester-level content — the broadest granularity."""
    t = get_trimester_for_week(week)
    return {
        "title": t["title"],
        "range": t["range"],
        "nutrition": t["nutrition"],
        "lifestyle": t["lifestyle"],
        "danger_signs": t["danger"],
    }


def get_monthly_content(pregnancy_month: int) -> dict:
    """pregnancy_month: 1-10 (lunar months, ~4 weeks each)."""
    approx_week = min(max(pregnancy_month * 4 - 2, 1), 42)
    t = get_trimester_for_week(approx_week)
    return {
        "month": pregnancy_month,
        "trimester_title": t["title"],
        "nutrition": t["nutrition"],
        "lifestyle": t["lifestyle"],
        "danger_signs": t["danger"],
    }


def get_weekly_content(week: int) -> dict:
    t = get_trimester_for_week(week)
    return {
        "week": week,
        "trimester_title": t["title"],
        "nutrition": t["nutrition"],
        "lifestyle": t["lifestyle"],
        "danger_signs": t["danger"],
        "milestone": WEEK_MILESTONES.get(week),
    }


def get_daily_content(day_of_pregnancy: int, week: int) -> dict:
    """Rotates through the current trimester's own nutrition/lifestyle/
    danger-sign lists — so "today's tip" is always trimester-appropriate,
    not generic filler, and never invents anything not already vetted."""
    t = get_trimester_for_week(week)
    nutrition = t["nutrition"][day_of_pregnancy % len(t["nutrition"])]
    lifestyle = t["lifestyle"][day_of_pregnancy % len(t["lifestyle"])]
    danger = t["danger"][day_of_pregnancy % len(t["danger"])]
    return {
        "nutrition_tip": nutrition,
        "lifestyle_tip": lifestyle,
        "danger_sign_reminder": danger,
    }
