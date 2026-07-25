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
 * Deliberately has no dependency on a crypto/uuid package: this project
 * doesn't already ship one (checked package.json — no expo-crypto,
 * react-native-get-random-values, or uuid as a direct dependency), and
 * pulling one in just for this is more risk than it's worth. The key only
 * needs to be unique per submission per user, not cryptographically
 * unguessable, so Math.random() + Date.now() is a fine primary
 * implementation here — not a fallback for a "real" generator.
 *
 * Web mirror: neomatcare-frontend/src/utils/idempotencyKey.js (which does
 * use crypto.randomUUID(), since a browser can assume that safely).
 */
export function generateIdempotencyKey() {
  return `idk_${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}
