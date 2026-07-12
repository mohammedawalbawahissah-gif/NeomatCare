"""
apps/wellness/services.py
---------------------------
get_pregnancy_snapshot() — computes current week/day/month from
    Patient.expected_delivery_date. Nothing is stored; it's always
    derived fresh from the single source of truth.

predict_next_cycle() — simple average-based prediction from a
    patient's logged CycleEntry history. Purely arithmetic, not
    medical advice.

generate_ai_message() — calls the existing apps.ai.service chat()
    function (role='patient') so pregnancy updates use the same
    assistant, model, and safety-tuned system prompt as the rest of
    the app, rather than a separate AI integration.
"""
import logging
from datetime import date, timedelta

from .content import get_daily_focus, get_monthly_content, get_weekly_content

logger = logging.getLogger(__name__)


def get_pregnancy_snapshot(patient) -> dict | None:
    """Returns None if the patient has no expected_delivery_date set —
    there's nothing to compute a week/day/month from without it."""
    edd = patient.expected_delivery_date
    if not edd:
        return None

    PREGNANCY_DAYS = 280  # 40 weeks, standard convention
    days_remaining = (edd - date.today()).days
    day_of_pregnancy = max(0, min(PREGNANCY_DAYS, PREGNANCY_DAYS - days_remaining))
    current_week = max(1, min(42, (day_of_pregnancy // 7) + 1))
    current_month = max(1, min(10, (day_of_pregnancy // 28) + 1))

    return {
        "expected_delivery_date": edd,
        "days_remaining": max(days_remaining, 0),
        "day_of_pregnancy": day_of_pregnancy,
        "current_week": current_week,
        "current_month": current_month,
        "weekly_content": get_weekly_content(current_week),
        "monthly_content": get_monthly_content(current_month),
        "daily_focus": get_daily_focus(day_of_pregnancy),
    }


def predict_next_cycle(user) -> dict | None:
    """Average-based prediction from logged CycleEntry rows. Needs at
    least 2 entries to compute an average cycle length; returns None
    otherwise (not enough history to predict anything meaningful)."""
    from .models import CycleEntry

    entries = list(
        CycleEntry.objects.filter(user=user).order_by("period_start")
    )
    if len(entries) < 2:
        return {"has_prediction": False, "entries_logged": len(entries)}

    gaps = [
        (entries[i].period_start - entries[i - 1].period_start).days
        for i in range(1, len(entries))
    ]
    avg_cycle_length = round(sum(gaps) / len(gaps))
    last_start = entries[-1].period_start
    predicted_next_start = last_start + timedelta(days=avg_cycle_length)

    # Fertile window: standard estimate is ~14 days before the next period,
    # +/- a few days — general cycle-tracking arithmetic, not medical advice.
    predicted_ovulation = predicted_next_start - timedelta(days=14)
    fertile_window_start = predicted_ovulation - timedelta(days=5)
    fertile_window_end = predicted_ovulation + timedelta(days=1)

    return {
        "has_prediction": True,
        "avg_cycle_length_days": avg_cycle_length,
        "last_period_start": last_start,
        "predicted_next_period_start": predicted_next_start,
        "predicted_fertile_window": [fertile_window_start, fertile_window_end],
        "entries_logged": len(entries),
    }


def generate_ai_message(patient_name: str, snapshot: dict) -> str:
    """Returns a personalized, warm, in-app message for this patient's
    current pregnancy stage, using the existing apps.ai chat() assistant
    (role='patient' already has a tuned system prompt: warm, plain
    language, never diagnoses, always points back to a health worker
    for concerns — reused here rather than duplicated).

    Falls back to a plain templated message if the AI call fails for
    any reason, so the daily job never silently sends nothing.

    ACTION NEEDED: confirm the actual import path below matches where
    ai_service.py lives in your repo (apps/ai/ai_service.py assumed —
    adjust if it's named/located differently).
    """
    focus = snapshot["daily_focus"]
    week = snapshot["current_week"]
    fallback = (
        f"Week {week} update: {focus['prompt']} "
        f"({snapshot['weekly_content']['trimester_title']})"
    )

    try:
        from apps.ai.service import AIServiceError, chat
    except ImportError:
        logger.warning(
            "Could not import apps.ai.ai_service — check the module path "
            "and update the import in generate_ai_message(). Using fallback."
        )
        return fallback

    prompt = (
        f"Write ONE short (max 2 sentences) in-app notification for "
        f"{patient_name}, who is in week {week} of pregnancy "
        f"({snapshot['weekly_content']['trimester_title']}). "
        f"Today's focus: {focus['prompt']}"
    )
    context = {
        "page": "pregnancy_tracker",
        "current_week": week,
        "trimester": snapshot["weekly_content"]["trimester_title"],
        "daily_focus": focus["focus"],
        "days_remaining": snapshot["days_remaining"],
    }

    try:
        text = chat(messages=[{"role": "user", "content": prompt}], role="patient", context=context)
        return text.strip() or fallback
    except AIServiceError:
        logger.exception("apps.ai chat() returned an error, using fallback template")
        return fallback
    except Exception:
        logger.exception("Unexpected error calling apps.ai chat(), using fallback template")
        return fallback
