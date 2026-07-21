"""
apps/voice/service.py
──────────────────────
Backend proxy for speech services. Exists so API keys (Khaya, Google Cloud)
never reach the client — the frontend/mobile apps call our endpoints, we
call the external provider.

English is NOT handled here. It uses the browser's speechSynthesis /
device's on-device TTS and the browser's SpeechRecognition / an on-device
mobile STT module — all free, all local to the client, no backend
involvement. Only non-English languages hit this service, because that's
the only tier that needs a cloud provider at all.

Provider map (see LANGUAGES below):
  - Khaya AI (GhanaNLP) — Twi, Dagbani, Ewe, Ga, Frafra/Gurune: STT + TTS
  - Google Cloud STT    — Hausa: STT only (no TTS confirmed available yet)

Adding a language: add an entry to LANGUAGES, and if it needs a provider
not listed here, add a new `_<provider>_stt` / `_<provider>_tts` pair and
route to it in `transcribe` / `synthesize`. Nothing else in this app
should need to change.
"""
import logging
import os
import tempfile

import requests

logger = logging.getLogger(__name__)


class VoiceServiceError(Exception):
    pass


# Language registry — single source of truth for the backend. The frontend
# and mobile apps keep their own copy for UI purposes; keep these in sync.
LANGUAGES = {
    "tw":  {"label": "Twi",     "stt_provider": "khaya",  "tts_provider": "khaya"},
    "dag": {"label": "Dagbani", "stt_provider": "khaya",  "tts_provider": "khaya"},
    "ee":  {"label": "Ewe",     "stt_provider": "khaya",  "tts_provider": "khaya"},
    "gaa": {"label": "Ga",      "stt_provider": "khaya",  "tts_provider": "khaya"},
    "gur": {"label": "Frafra (Gurune)", "stt_provider": "khaya", "tts_provider": "khaya"},
    "ha":  {"label": "Hausa",   "stt_provider": "google", "tts_provider": None},
}


def _khaya_client():
    from django.conf import settings
    api_key = settings.KHAYA_API_KEY
    if not api_key:
        raise VoiceServiceError(
            "Khaya API key not configured. Sign up at https://translation.ghananlp.org/ "
            "and set KHAYA_API_KEY."
        )
    try:
        from ghana_nlp import GhanaNLP
    except ImportError as exc:
        raise VoiceServiceError("ghana-nlp package not installed.") from exc
    return GhanaNLP(api_key=api_key)


def _khaya_stt(audio_bytes: bytes, lang_code: str, content_type: str) -> str:
    """
    Writes the uploaded audio to a temp file since the ghana-nlp client's
    documented interface takes a file path, not raw bytes.

    NOTE: exact method name/signature should be re-verified against the
    installed ghana-nlp version's actual source once a real API key is in
    place — published docs for this package are inconsistent across
    versions (some show `.stt()`, others `.speech_to_text()`). This uses
    the interface shown on the current PyPI project page.
    """
    client = _khaya_client()
    suffix = ".wav" if "wav" in (content_type or "") else ".m4a"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    try:
        result = client.speech_to_text(tmp_path, language=lang_code)
        # Response shape not independently confirmed — handle both a plain
        # string and a dict with a text-like key defensively.
        if isinstance(result, dict):
            return result.get("text") or result.get("transcript") or str(result)
        return str(result)
    except Exception as exc:
        logger.error("Khaya STT error (%s): %s", lang_code, exc)
        raise VoiceServiceError(f"Speech-to-text failed: {exc}") from exc
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def _khaya_tts(text: str, lang_code: str) -> bytes:
    client = _khaya_client()
    try:
        result = client.text_to_speech(text, lang=lang_code)
        if isinstance(result, (bytes, bytearray)):
            return bytes(result)
        # Some doc examples show a URL being returned instead of raw audio —
        # if so, fetch it.
        if isinstance(result, str) and result.startswith("http"):
            resp = requests.get(result, timeout=15)
            resp.raise_for_status()
            return resp.content
        raise VoiceServiceError("Unexpected response shape from Khaya TTS.")
    except VoiceServiceError:
        raise
    except Exception as exc:
        logger.error("Khaya TTS error (%s): %s", lang_code, exc)
        raise VoiceServiceError(f"Text-to-speech failed: {exc}") from exc


def _google_stt(audio_bytes: bytes, lang_code: str) -> str:
    """
    Hausa fallback. Uses Google Cloud Speech-to-Text v1 REST API directly —
    raw audio, base64-encoded, sent as a single synchronous recognize call.
    Assumes 16kHz LINEAR16 or a self-describing container; adjust encoding
    per what the client actually records (see mobile/web recording setup).
    """
    from django.conf import settings
    import base64

    api_key = settings.GOOGLE_CLOUD_STT_API_KEY
    if not api_key:
        raise VoiceServiceError("Hausa dictation isn't configured yet — Google Cloud STT key missing.")

    lang_map = {"ha": "ha-NG"}
    body = {
        "config": {
            "languageCode": lang_map.get(lang_code, "ha-NG"),
            "enableAutomaticPunctuation": True,
        },
        "audio": {"content": base64.b64encode(audio_bytes).decode("ascii")},
    }
    try:
        resp = requests.post(
            f"https://speech.googleapis.com/v1/speech:recognize?key={api_key}",
            json=body,
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results", [])
        if not results:
            return ""
        return results[0]["alternatives"][0]["transcript"]
    except Exception as exc:
        logger.error("Google STT error (%s): %s", lang_code, exc)
        raise VoiceServiceError(f"Speech-to-text failed: {exc}") from exc


def transcribe(audio_bytes: bytes, lang_code: str, content_type: str = "") -> str:
    """Dictation entry point. Raises VoiceServiceError with a message safe to show the user."""
    lang = LANGUAGES.get(lang_code)
    if not lang:
        raise VoiceServiceError(f"Unsupported language: {lang_code}")
    provider = lang["stt_provider"]
    if provider == "khaya":
        return _khaya_stt(audio_bytes, lang_code, content_type)
    if provider == "google":
        return _google_stt(audio_bytes, lang_code)
    raise VoiceServiceError(f"Dictation not available for {lang['label']}.")


def synthesize(text: str, lang_code: str) -> bytes:
    """Read-aloud entry point. Raises VoiceServiceError with a message safe to show the user."""
    lang = LANGUAGES.get(lang_code)
    if not lang:
        raise VoiceServiceError(f"Unsupported language: {lang_code}")
    provider = lang["tts_provider"]
    if provider == "khaya":
        return _khaya_tts(text, lang_code)
    raise VoiceServiceError(f"Read-aloud not available for {lang['label']} yet.")
