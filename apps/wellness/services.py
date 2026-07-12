"""
apps/wellness/services.py
---------------------------
get_pregnancy_snapshot() — computes current week/day/month from
    Patient.expected_delivery_date. Nothing is stored; it's always
    derived fresh from the single source of truth. Returns content at
    ALL FOUR granularities: daily, weekly, monthly, trimester.

set_self_reported_edd() — lets a logged-in patient set their own
    expected_delivery_date via a last-menstrual-period date, when they
    have a linked Patient record but no EDD on file yet (e.g. before
    their first clinic visit). This directly overwrites
    Patient.expected_delivery_date — same field a clinician would set
    later, so a clinician visit naturally supersedes it. It does NOT
    create a new Patient record if none is linked; that stays a
    health-worker action (CreatePatientModal), since a full clinical
    Patient record needs fields a patient shouldn't self-declare
    (hospital_id, facility, etc).

predict_next_cycle() — average-based prediction from a patient's
    logged CycleEntry history. Gives an estimate after just ONE logged
    period (using a standard 28-day cycle assumption, clearly flagged
    as an estimate) and switches to a personalized average once 2+
    entries exist. Purely arithmetic, not medical advice.

generate_ai_message() — calls the existing apps.ai.service chat()
    function (role='patient') so pregnancy updates use the same
    assistant, model, and safety-tuned system prompt as the rest of
    the app, rather than a separate AI integration.
"""
import logging
from datetime import date, timedelta

from .content import (
    get_daily_content,
    get_monthly_content,
    get_trimester_content,
    get_weekly_content,
)

logger = logging.getLogger(__name__)

PREGNANCY_DAYS = 280  # 40 weeks, standard convention
DEFAULT_CYCLE_LENGTH_DAYS = 28  # used only for the single-entry estimate


def get_pregnancy_snapshot(patient) -> dict | None:
    """Returns None if the patient has no expected_delivery_date set —
    there's nothing to compute a week/day/month from without it."""
    edd = patient.expected_delivery_date
    if not edd:
        return None

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
        "daily_content": get_daily_content(day_of_pregnancy, current_week),
        "weekly_content": get_weekly_content(current_week),
        "monthly_content": get_monthly_content(current_month),
        "trimester_content": get_trimester_content(current_week),
    }


def set_self_reported_edd(user, last_period_start: date) -> dict:
    """Patient self-reports their last menstrual period date; we compute
    and save an estimated EDD (LMP + 280 days) directly onto their
    linked Patient record. Returns a result dict — caller (the view)
    decides how to translate 'no_patient_record' into an HTTP status."""
    from apps.cases.models import Patient

    patient = Patient.objects.filter(patient_user=user).first()
    if not patient:
        return {
            "ok": False,
            "reason": "no_patient_record",
            "detail": "No linked patient record — a health worker needs to register you first.",
        }

    estimated_edd = last_period_start + timedelta(days=PREGNANCY_DAYS)
    patient.expected_delivery_date = estimated_edd
    patient.save(update_fields=["expected_delivery_date"])

    return {"ok": True, "expected_delivery_date": estimated_edd}


def predict_next_cycle(user) -> dict:
    """Average-based prediction from logged CycleEntry rows.
    - 0 entries: nothing to predict from yet.
    - 1 entry: estimate using a standard 28-day cycle, clearly flagged
      as an estimate (is_estimated=True) rather than personalized.
    - 2+ entries: personalized average from the patient's own history.
    """
    from .models import CycleEntry

    entries = list(
        CycleEntry.objects.filter(user=user).order_by("period_start")
    )

    if not entries:
        return {"has_prediction": False, "entries_logged": 0}

    if len(entries) == 1:
        last_start = entries[0].period_start
        avg_cycle_length = DEFAULT_CYCLE_LENGTH_DAYS
        is_estimated = True
    else:
        gaps = [
            (entries[i].period_start - entries[i - 1].period_start).days
            for i in range(1, len(entries))
        ]
        avg_cycle_length = round(sum(gaps) / len(gaps))
        last_start = entries[-1].period_start
        is_estimated = False

    predicted_next_start = last_start + timedelta(days=avg_cycle_length)

    # Fertile window: standard estimate is ~14 days before the next period,
    # +/- a few days — general cycle-tracking arithmetic, not medical advice.
    predicted_ovulation = predicted_next_start - timedelta(days=14)
    fertile_window_start = predicted_ovulation - timedelta(days=5)
    fertile_window_end = predicted_ovulation + timedelta(days=1)

    return {
        "has_prediction": True,
        "is_estimated": is_estimated,
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
    """
    daily = snapshot["daily_content"]
    week = snapshot["current_week"]
    trimester_title = snapshot["weekly_content"]["trimester_title"]
    fallback = f"Week {week} update: {daily['lifestyle_tip']} ({trimester_title})"

    try:
        from apps.ai.service import AIServiceError, chat
    except ImportError:
        logger.warning(
            "Could not import apps.ai.service — check the module path "
            "and update the import in generate_ai_message(). Using fallback."
        )
        return fallback

    prompt = (
        f"Write ONE short (max 2 sentences) in-app notification for "
        f"{patient_name}, who is in week {week} of pregnancy ({trimester_title}). "
        f"Today's nutrition tip: {daily['nutrition_tip']} "
        f"Today's lifestyle tip: {daily['lifestyle_tip']}"
    )
    context = {
        "page": "pregnancy_tracker",
        "current_week": week,
        "trimester": trimester_title,
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
