"""
apps/wellness/services.py
---------------------------
get_pregnancy_snapshot() — computes current week/day/month from
    Patient.expected_delivery_date. Nothing is stored; it's always
    derived fresh from the single source of truth.

predict_next_cycle() — simple average-based prediction from a
    patient's logged CycleEntry history. Purely arithmetic, not
    medical advice.

generate_ai_message() — ADAPTER. This calls whatever backs your
    existing /api/ai/chat/ endpoint. I don't have apps/ai's actual
    services.py/views.py in front of me, so this is written as a
    clearly-marked placeholder using the Anthropic SDK directly.
    ACTION NEEDED FROM YOU: if apps/ai already has an internal
    function (not the HTTP view) that does chat completion, replace
    the body of generate_ai_message() with a call to that function
    instead of duplicating the API call here. Look for something
    like apps/ai/services.py:get_completion() or similar.
"""
import logging
from datetime import date, timedelta

from django.conf import settings

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
    current pregnancy stage. Falls back to a plain templated message
    if the AI call fails, so the daily job never silently sends nothing."""
    focus = snapshot["daily_focus"]
    week = snapshot["current_week"]
    fallback = (
        f"Week {week} update: {focus['prompt']} "
        f"({snapshot['weekly_content']['trimester_title']})"
    )

    api_key = getattr(settings, "ANTHROPIC_API_KEY", "")
    if not api_key:
        return fallback

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=api_key)
        prompt = (
            f"You are a warm, encouraging pregnancy assistant inside a maternal "
            f"health app. Write ONE short (max 2 sentences) in-app notification "
            f"for {patient_name}, who is in week {week} of pregnancy "
            f"({snapshot['weekly_content']['trimester_title']}). "
            f"Focus on: {focus['prompt']} "
            f"Do not diagnose or give specific medical dosing advice. "
            f"Be warm and human, not clinical."
        )
        response = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=150,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(
            block.text for block in response.content if block.type == "text"
        ).strip()
        return text or fallback
    except Exception:
        logger.exception("AI message generation failed, using fallback template")
        return fallback
