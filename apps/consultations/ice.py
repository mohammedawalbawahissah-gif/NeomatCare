"""
apps/consultations/ice.py
──────────────────────────
Fetches fresh, short-lived TURN credentials from whichever provider(s) are
configured, and combines them with a couple of free public STUN servers
into one iceServers list for the client's RTCPeerConnection.

Both providers are optional and independent — this never errors out just
because one (or both) isn't configured; it just returns fewer relay
candidates, same as the rest of this app's "degrade, don't break" pattern
for optional third-party integrations (Khaya, Google STT).

Credentials are fetched fresh on every call to this function rather than
cached — call setup in this app is infrequent enough that hitting each
provider's API once per call attempt is not a meaningful cost or rate-limit
concern, and it avoids ever handing out an expired short-lived credential.
"""
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

FREE_STUN_SERVERS = [
    {"urls": "stun:stun.l.google.com:19302"},
    {"urls": "stun:stun1.l.google.com:19302"},
]

REQUEST_TIMEOUT = 8  # seconds — a slow TURN-credential fetch shouldn't hang call setup


def _xirsys_ice_servers():
    if not (settings.XIRSYS_IDENT and settings.XIRSYS_SECRET and settings.XIRSYS_CHANNEL):
        return []
    try:
        resp = requests.put(
            f"https://global.xirsys.net/_turn/{settings.XIRSYS_CHANNEL}",
            auth=(settings.XIRSYS_IDENT, settings.XIRSYS_SECRET),
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        ice = data.get("v", {}).get("iceServers")
        if not ice:
            return []
        # Xirsys returns either one server object or (per their docs) sometimes
        # a list — normalize to a list either way rather than assume the shape.
        return ice if isinstance(ice, list) else [ice]
    except Exception as exc:
        logger.warning("Xirsys ICE server fetch failed: %s", exc)
        return []


def _twilio_ice_servers():
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN):
        return []
    try:
        resp = requests.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Tokens.json",
            auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("ice_servers", []) or []
    except Exception as exc:
        logger.warning("Twilio ICE server fetch failed: %s", exc)
        return []


def get_ice_servers():
    """Returns a combined iceServers list: free STUN + whichever TURN providers are configured and reachable."""
    servers = list(FREE_STUN_SERVERS)
    servers.extend(_xirsys_ice_servers())
    servers.extend(_twilio_ice_servers())
    return servers
