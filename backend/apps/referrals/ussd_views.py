"""
apps/referrals/ussd_views.py
-----------------------------
POST /ussd/ — Africa's Talking USSD callback.

No DRF, no authentication: AT calls this directly as a webhook, posting
application/x-www-form-urlencoded (not JSON), and identifies the caller
by phoneNumber, not a bearer token. csrf_exempt for the same reason
health_urls.py's health check has no auth — this endpoint has to be
reachable before any app-level session exists. Identity/authorization is
instead handled inside ussd_service.handle_ussd_request (only a
registered health_worker/facility_admin phone number gets past screen 1).

The response is plain text (not JSON) — AT's USSD gateway expects the raw
CON/END-prefixed string as the body, not a wrapped response.
"""
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from ussd_service import handle_ussd_request


@csrf_exempt
@require_POST
def ussd_callback(request):
    session_id   = request.POST.get("sessionId", "")
    phone_number = request.POST.get("phoneNumber", "")
    text         = request.POST.get("text", "")

    response_text = handle_ussd_request(session_id, phone_number, text)
    return HttpResponse(response_text, content_type="text/plain")
