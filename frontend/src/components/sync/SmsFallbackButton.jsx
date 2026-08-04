/**
 * src/components/sync/SmsFallbackButton.jsx
 *
 * Web counterpart to mobile's triggerAutoReferralSms() (see
 * mobile/src/utils/smsReferralFallback.js) — same message format, same
 * gateway number, same backend endpoint (sms_inbound_service.py). A
 * browser can't send SMS silently, but a MOBILE browser (Safari/Chrome on
 * a phone) does support opening the native SMS composer via an sms: link,
 * same mechanism as the mobile app's Linking.openURL. Desktop browsers
 * don't — there's no equivalent there, so this falls back to a
 * copy-to-clipboard button with the same message, for someone to paste
 * into whatever messaging app they have on another device.
 *
 * Shown only for a stuck HIGH-priority item (see isStuckCritical) — not
 * offered for routine queued writes, where waiting for reconnection is
 * the right behaviour.
 */
import { useState } from 'react'
import { PhoneCall, MessageSquare, Copy, Check } from 'lucide-react'
import { SMS_REFERRAL_NUMBER } from '../../constants/gateway'

function buildAutoReferralSmsBody(item) {
  const age = item?.data?.patient_age ?? item?.data?.age ?? 0
  const dangerSigns = item?.data?.danger_signs
  const signs = Array.isArray(dangerSigns) && dangerSigns.length ? dangerSigns.join(' ') : 'UNSPECIFIED'
  const patientName = item?.data?.patient_name
  const nameTag = patientName ? ` (${patientName})` : ''
  return `REFER ${age} ${signs}${nameTag}`
}

// Mobile browsers support sms: links; desktop ones generally don't. There's
// no reliable feature-detection for this (canOpenURL is a native-app API,
// not a web one) — a coarse user-agent check is the honest option here,
// same tradeoff every "is this a mobile browser" check on the web has.
function isLikelyMobileBrowser() {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export default function SmsFallbackButton({ item }) {
  const [copied, setCopied] = useState(false)
  const body = buildAutoReferralSmsBody(item)
  const smsUrl = `sms:${SMS_REFERRAL_NUMBER}?body=${encodeURIComponent(body)}`
  const mobileBrowser = isLikelyMobileBrowser()

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${SMS_REFERRAL_NUMBER}: ${body}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API can be unavailable (non-HTTPS, permissions) — the
      // message is still visible in the banner below for manual copy.
    }
  }

  return (
    <div className="mx-3 mt-3 mb-1 px-3 py-2.5 rounded-lg bg-red-50 border border-red-100">
      <div className="flex gap-2 items-start mb-2">
        <PhoneCall size={14} className="text-red-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-red-700 leading-snug">
          <span className="font-semibold">An emergency case hasn't synced.</span> If this device has no data
          connection, send it by SMS instead — this creates the referral automatically once received.
        </p>
      </div>
      <p className="text-[10px] font-mono text-red-500 bg-white/60 rounded px-2 py-1 mb-2 break-all">
        To {SMS_REFERRAL_NUMBER}: {body}
      </p>
      <div className="flex gap-2">
        {mobileBrowser ? (
          <a
            href={smsUrl}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md px-2.5 py-1.5 transition-colors"
          >
            <MessageSquare size={12} /> Open SMS
          </a>
        ) : (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md px-2.5 py-1.5 transition-colors"
          >
            {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy message</>}
          </button>
        )}
      </div>
      {!mobileBrowser && (
        <p className="text-[10px] text-red-400 mt-1.5">
          Desktop browsers can't open a text app — copy this and send it from a phone instead.
        </p>
      )}
    </div>
  )
}
