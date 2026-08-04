"""
apps/referrals/sms_inbound_views.py
-------------------------------------
POST /sms/inbound/ — Africa's Talking inbound-SMS callback.

Same shape as ussd_views.py's ussd_callback for the same reasons: no DRF,
no auth (AT calls this as a webhook, form-encoded, identified by sender
phone number not a bearer token), csrf_exempt since there's no app-level
session at the point this fires. Identity/authorization happens inside
sms_inbound_service.handle_inbound_sms (only a registered health_worker/
facility_admin phone number can create a referral this way).

Always returns 200 — Africa's Talking retries non-2xx responses, and a
retry on our own validation/format error (unregistered sender, bad
format) would just resend the same rejected message; the "did this work"
signal for the sender is the outbound SMS confirmation sms_service.py
already sends, not this webhook's own response body.
"""
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from sms_inbound_service import handle_inbound_sms


@csrf_exempt
@require_POST
def sms_inbound_callback(request):
    sender_phone = request.POST.get("from", "")
    text         = request.POST.get("text", "")
    message_id   = request.POST.get("id", "")

    handle_inbound_sms(sender_phone, text, message_id)
    # Africa's Talking doesn't inspect the response body for inbound SMS
    # callbacks the way it does for USSD — any 200 is treated as
    # "received", so there's no CON/END convention to follow here.
    return HttpResponse("Received", content_type="text/plain")
