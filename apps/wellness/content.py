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


# ── Under-five nutrition & feeding guidance ─────────────────────────────────
#
# Age bands and general feeding practice follow WHO/UNICEF Infant and Young
# Child Feeding (IYCF) guidance — the same widely-taught public-health
# education CHPS/nutrition officers already give caregivers, not a novel
# clinical claim. Danger signs are the standard IMCI (Integrated Management
# of Childhood Illness) general danger-sign list used to train community
# health workers — again standard patient/caregiver education, not a
# diagnostic tool. As with the pregnancy content above, this deliberately
# does not attempt WHO growth-chart classification (e.g. MUAC red/yellow/
# green banding) — that belongs in a clinician-reviewed pass, flagged as a
# roadmap item, not fabricated here.
#
# `food_secure_tips` assumes normal household access to food; `resource_limited_tips`
# swaps in low-cost, locally available options common in Northern Ghana
# (beans, groundnuts, moringa leaves, soya, eggs) — this is what makes the
# guidance "local", per the hack brief, rather than generic.
CHILD_AGE_BANDS = [
    {
        "range": (0, 5),  # 0-6 months, inclusive of month 5 (i.e. under 6 months)
        "title": "0-6 months",
        "food_secure_tips": [
            "Breastfeed exclusively — no water, other liquids, or foods needed before 6 months.",
            "Feed on demand, day and night, at least 8 times in 24 hours.",
            "Watch for hunger cues (rooting, sucking on hands) rather than a strict schedule.",
        ],
        "resource_limited_tips": [
            "Exclusive breastfeeding is still the best and lowest-cost option — it needs no extra food budget.",
            "If breastfeeding is difficult, ask your health worker for support before introducing any substitute.",
            "Continue feeding on demand even if the mother's own diet is limited — breastmilk production adapts; focus any extra food you do have on the breastfeeding mother.",
        ],
    },
    {
        "range": (6, 23),
        "title": "6-23 months",
        "food_secure_tips": [
            "Continue breastfeeding alongside complementary foods up to age 2 or beyond.",
            "Aim for a minimum of 4 food groups a day (grains, legumes/nuts, dairy, meat/fish/eggs, fruits/vegetables).",
            "Feed 2-3 meals a day at 6-8 months, increasing to 3-4 meals plus 1-2 snacks by 12 months.",
            "Increase food thickness and variety as the child gets older — avoid thin, watery porridge alone.",
        ],
        "resource_limited_tips": [
            "Continue breastfeeding — it remains a key, no-cost source of nutrition through this period.",
            "Mash local staples (tuo zaafi, TZ, banku, rice) with beans, groundnut paste, or moringa leaf powder to boost protein and micronutrients cheaply.",
            "Eggs, when available, are an affordable, complete source of protein for this age group.",
            "Soaked and mashed soybeans or cowpeas can substitute for meat/fish on days they're unavailable.",
            "Even a small amount of added groundnut paste or oil increases the energy density of a thin porridge.",
        ],
    },
    {
        "range": (24, 59),
        "title": "24-59 months",
        "food_secure_tips": [
            "Offer 3 family meals a day plus 1-2 healthy snacks.",
            "Include a variety of foods daily — grains, legumes, vegetables, fruit, and an animal-source food where possible.",
            "Encourage self-feeding and a consistent mealtime routine.",
        ],
        "resource_limited_tips": [
            "Family meals are appropriate now — no need for separate preparation, just ensure the child gets a fair portion.",
            "Rotate cheaper protein sources through the week: beans, groundnuts, soya, eggs, or dried fish when available.",
            "Dark leafy greens (moringa, kontomire/cocoyam leaves) added to soups or stews are a low-cost source of vitamins and iron.",
            "If a full varied diet isn't possible every day, prioritise variety over quantity within what's available.",
        ],
    },
]

# Standard IMCI general danger signs for under-five children — the same
# list CHPS workers are trained to screen for. Presented as caregiver
# education ("seek care now if you see this"), not a diagnostic checklist.
CHILD_DANGER_SIGNS = [
    "Not able to drink or breastfeed at all",
    "Vomits everything",
    "Convulsions (fits)",
    "Lethargic or difficult to wake",
    "Fast or difficult breathing",
    "Fever (feels hot, or has had a fever for several days)",
    "Diarrhoea with blood in the stool, or lasting more than a few days",
    "Swelling of both feet (possible sign of severe malnutrition)",
    "Very thin or visible wasting",
]


def get_child_age_band(age_months: int) -> dict:
    for band in CHILD_AGE_BANDS:
        lo, hi = band["range"]
        if lo <= age_months <= hi:
            return band
    # Older than the oldest band (5+) or a bad/negative input — fall back
    # to the closest defined band rather than raising.
    return CHILD_AGE_BANDS[-1] if age_months > CHILD_AGE_BANDS[-1]["range"][1] else CHILD_AGE_BANDS[0]


def get_child_nutrition_content(age_months: int, food_security_flag: str = "unknown") -> dict:
    """food_security_flag: one of Household.FoodSecurityStatus values
    ('secure', 'at_risk', 'insecure', 'unknown'). 'at_risk' and 'insecure'
    both get the resource-limited tips — the distinction between them is
    about how urgently a health worker should follow up, not about which
    guidance to show."""
    band = get_child_age_band(age_months)
    use_resource_limited = food_security_flag in ("at_risk", "insecure")
    return {
        "age_months": age_months,
        "age_band": band["title"],
        "feeding_tips": band["resource_limited_tips"] if use_resource_limited else band["food_secure_tips"],
        "danger_signs": CHILD_DANGER_SIGNS,
        "food_security_flag": food_security_flag,
        "guidance_scope": "resource_limited" if use_resource_limited else "standard",
    }
