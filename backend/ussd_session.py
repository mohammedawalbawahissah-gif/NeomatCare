"""
ussd_session.py
-----------------
Tiny wrapper around Django's cache framework for holding in-progress USSD
session state between one Africa's Talking callback and the next, keyed by
their sessionId. See the top of ussd_service.py for why this exists and
why it needs a shared (Redis) cache backend in production.

Deliberately trivial — three functions, no class, nothing clever. If this
ever needs to grow (e.g. a second USSD menu tree — see the household
follow-up scoping note in the deployment guide), consider a small
dataclass for the state shape instead of a bare dict, but there's no need
for that complexity yet with one flow.
"""
from django.core.cache import cache

_PREFIX = "ussd_session:"
# A few minutes longer than Africa's Talking's own session timeout
# (typically ~60-180s depending on carrier) — the session will always end
# on AT's side first; this is just a safety net so an abandoned session's
# state doesn't linger in the cache indefinitely.
_TTL_SECONDS = 300


def get_session(session_id: str) -> dict | None:
    return cache.get(_PREFIX + session_id)


def save_session(session_id: str, state: dict) -> None:
    cache.set(_PREFIX + session_id, state, _TTL_SECONDS)


def clear_session(session_id: str) -> None:
    cache.delete(_PREFIX + session_id)
