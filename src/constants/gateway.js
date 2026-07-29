// src/constants/gateway.js
//
// The inbound SMS number and USSD short code behind the no-data-
// connectivity referral fallback (see backend sms_inbound_service.py and
// ussd_service.py). Set these to whatever number/code is actually
// provisioned with the SMS provider (Africa's Talking) before going
// live — these are placeholders. Mirrors mobile's src/constants/gateway.js.
export const SMS_REFERRAL_NUMBER = '0800000000' // TODO: set to the provisioned inbound SMS number
export const USSD_REFERRAL_CODE = '*920*15#'     // TODO: set to the provisioned USSD short code
