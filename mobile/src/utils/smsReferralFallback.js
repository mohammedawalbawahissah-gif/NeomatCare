/**
 * src/utils/smsReferralFallback.js
 *
 * The offline queue (offlineQueue.js) solves *sync* — a queued referral
 * reaches the server once the device gets data connectivity back. It does
 * NOT solve *reachability*: in the northern belt, a CHPS compound can go
 * days without mobile data even where basic voice/SMS signal is fine (SMS
 * rides the much lower-bandwidth GSM control channel, not the data
 * network). A referral sitting in the offline queue waiting for data is
 * exactly the "most facilities would never get their emergency cases
 * referred" problem.
 *
 * This is a SEPARATE, immediate side-channel — not routed through the
 * offline queue at all. It opens the device's native SMS composer,
 * pre-filled, the moment a referral fails to reach the server. The
 * health worker still has to tap Send (this app cannot send SMS silently
 * in the background — that requires a native module and carrier
 * permissions this app doesn't have), but that's one tap on a screen
 * that's already open, and it uses the phone's own SMS radio rather than
 * the data connection that just failed.
 *
 * Two message shapes live here, addressed to two different numbers:
 *
 *   triggerAutoReferralSms() — addressed to the fixed inbound gateway
 *   number (SMS_REFERRAL_NUMBER), in the "REFER <age> <details>" format
 *   sms_inbound_service.py parses server-side. This is the PRIMARY path:
 *   it creates a real, engine-routed Referral the moment the SMS is
 *   received — same automation level as the USSD fallback — and the
 *   receiving facility gets notified automatically via the backend's
 *   existing outbound SMS pipeline once that referral exists. No need to
 *   know the receiving facility's own phone number for this to work.
 *
 *   triggerEmergencyReferralSms() — addressed directly to the receiving
 *   facility's own phone (when known), free-text and human-readable. A
 *   secondary, purely informal heads-up for a facility to expect a
 *   patient — it does NOT create anything server-side on its own, so
 *   it's a courtesy notice, not a replacement for the gateway message.
 */
import { Linking, Platform } from 'react-native';
import { SMS_REFERRAL_NUMBER } from '../constants/gateway';

/**
 * @param {object} opts
 * @param {string} opts.patientName
 * @param {number|string} opts.age
 * @param {string[]} opts.dangerSigns
 * @param {string} opts.referringFacilityName
 * @param {string} [opts.referenceId] - local case/referral id (server id if known, otherwise the client-generated idempotency key) so staff can cross-reference once it syncs
 */
export function buildReferralSmsBody({ patientName, age, dangerSigns, referringFacilityName, referenceId }) {
  const signs = dangerSigns && dangerSigns.length ? dangerSigns.join(', ') : 'not specified';
  const refTag = referenceId ? ` Ref:${String(referenceId).slice(0, 8).toUpperCase()}` : '';
  return (
    `NeoMatCare EMERGENCY REFERRAL (sent via SMS - app offline). ` +
    `Patient: ${patientName || 'Unnamed'}, Age ${age || 'unknown'}. ` +
    `Signs: ${signs}. From: ${referringFacilityName || 'referring facility'}.` +
    `${refTag} Please expect this patient and call back if unable to receive.`
  );
}

/**
 * The gateway-addressed, machine-parseable message. Must start with
 * "REFER <age> " for sms_inbound_service.REFER_PATTERN to match — the
 * rest is free text and is best-effort keyword-matched for danger signs
 * server-side (both lay phrases AND the app's own DangerSign codes are
 * recognised, so passing codes straight through here, as below, works).
 *
 * Optional tags (order-independent, added by the app when it has the
 * data — a human free-texting this from their own messages app would
 * never type these, and doesn't need to; the format stays backward
 * compatible with a bare "REFER 28 heavy bleeding"):
 *   HID:<hospitalId>   — links to an EXISTING patient server-side instead
 *                         of creating a duplicate (see (A)'s USSD lookup —
 *                         this is the same fix, same reasoning, for SMS).
 *   NAME:<patient name> — ignored server-side if HID matched a real
 *                         patient (their name is already on file); used
 *                         for a genuinely new patient otherwise.
 *   REF:<referenceId>   — the local queued-mutation id, so staff can
 *                         cross-reference this SMS-created referral back
 *                         to what's sitting in the offline queue once it
 *                         eventually syncs too.
 */
export function buildAutoReferralSmsBody({ age, dangerSigns, patientName, hospitalId, referenceId }) {
  const signs = dangerSigns && dangerSigns.length ? dangerSigns.join(' ') : 'UNSPECIFIED';
  const parts = [`REFER ${age || 0} ${signs}`];
  if (hospitalId) parts.push(`HID:${hospitalId}`);
  if (patientName) parts.push(`NAME:${patientName}`);
  if (referenceId) parts.push(`REF:${String(referenceId).slice(0, 8).toUpperCase()}`);
  return parts.join(' ');
}

/**
 * Opens the device's native SMS composer, pre-filled and addressed to
 * `phone`. Returns true if the composer was opened, false if it couldn't
 * be (no phone number, or no SMS capability on this device — e.g. a wifi-
 * only tablet). Never throws — a failure here should never block the rest
 * of the referral-queuing flow.
 */
export async function openReferralSmsComposer(phone, body) {
  if (!phone) return false;
  try {
    const separator = Platform.OS === 'ios' ? '&' : '?';
    const url = `sms:${phone}${separator}body=${encodeURIComponent(body)}`;
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * PRIMARY fallback — gateway-addressed, auto-creates a real referral
 * server-side the moment it's received. Doesn't need the receiving
 * facility's phone number; the backend's referral engine picks the
 * facility, same as it would for an in-app referral.
 */
export async function triggerAutoReferralSms({ age, dangerSigns, patientName, hospitalId, referenceId }) {
  const body = buildAutoReferralSmsBody({ age, dangerSigns, patientName, hospitalId, referenceId });
  return openReferralSmsComposer(SMS_REFERRAL_NUMBER, body);
}

/**
 * SECONDARY, optional — direct heads-up to the receiving facility's own
 * phone, when known. Purely informal; does not create anything
 * server-side. Use alongside triggerAutoReferralSms(), not instead of it.
 */
export async function triggerEmergencyReferralSms({
  facilityPhone, patientName, age, dangerSigns, referringFacilityName, referenceId,
}) {
  if (!facilityPhone) return false;
  const body = buildReferralSmsBody({ patientName, age, dangerSigns, referringFacilityName, referenceId });
  return openReferralSmsComposer(facilityPhone, body);
}
