/**
 * src/utils/idempotencyKey.js
 *
 * Mint one key per form submission (not per HTTP attempt). Call this once
 * when the user hits "submit" and include the result in the payload sent to
 * the backend. Because the offline queue (see utils/offlineQueue.js) simply
 * resends the same `data` object on retry, the key naturally stays fixed
 * across every attempt for that submission — which is exactly what lets the
 * backend recognize "this is the same request as before" instead of
 * creating a duplicate record when a slow response gets misread as offline.
 *
 * Web mirror of neomatcare-mobile/src/utils/idempotencyKey.js.
 */
export function generateIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback for non-secure contexts / older browsers where crypto.randomUUID
  // isn't available. Not cryptographically strong, but collision odds are
  // irrelevant here — this only needs to be unique per submission per user.
  return `idk_${Date.now()}_${Math.random().toString(36).slice(2)}`
}
