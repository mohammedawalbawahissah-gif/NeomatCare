/**
 * src/utils/offlineQueue.js
 *
 * A CHPS worker filling out a patient record in a village with no signal
 * cannot lose that work. This module persists queued writes (POST/PATCH/
 * DELETE) to AsyncStorage and drains them through the real apiClient —
 * same auth headers, same refresh-token handling — the moment connectivity
 * comes back.
 *
 * Scope (MVP): non-AI, non-file mutations only. Endpoints that return data
 * the UI needs immediately to keep working (e.g. /api/ai/*, file uploads)
 * are NOT queued here — those should surface an error instead of a queue
 * entry, since there is nothing useful to "sync later" for them.
 *
 * Storage is intentionally NOT encrypted (unlike secureStorage.js) — this
 * holds patient records the app already fetches over plain apiClient calls,
 * not credentials. Keep it that way; don't queue anything containing tokens.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../api/client';

const QUEUE_KEY = 'nmc_offline_queue_v1';
const MAX_RETRIES = 5;
export { MAX_RETRIES };

/**
 * Single source of truth for what can be queued. Every enqueue call site
 * and every UI that displays the queue (SyncQueueBell, list-screen
 * merging) references these constants instead of ad-hoc strings — that's
 * what keeps "what's queued" traceable as the set of queueable writes
 * grows, rather than each screen inventing its own label.
 *
 * To add a new queueable write: add an entry here with a human label and
 * icon, then use QueueKinds.<NAME> in the screen's submitOrQueue call.
 */
export const QueueKinds = {
  PATIENT_CREATE: 'patient_create',
  CASE_CREATE: 'case_create',
  REFERRAL_CREATE: 'referral_create',
  ANC_VISIT_CREATE: 'anc_visit_create',
  HOUSEHOLD_CREATE: 'household_create',
  GROWTH_RECORD_CREATE: 'growth_record_create',
};

// Priority-tiered queue (item 5 of the offline-first work). HIGH-priority
// items are the emergency-adjacent ones — an emergency case or a referral
// sitting queued has real, time-critical consequences (see the SMS
// side-channel in smsReferralFallback.js, which fires immediately for
// these kinds rather than waiting for the queue to drain). Everything else
// stays on the original lazy-sync path: a delayed ANC visit or growth log
// is not a safety issue the same way a stuck referral is.
export const Priority = { HIGH: 'high', ROUTINE: 'routine' };

const KIND_PRIORITY = {
  [QueueKinds.CASE_CREATE]: Priority.HIGH,
  [QueueKinds.REFERRAL_CREATE]: Priority.HIGH,
  [QueueKinds.PATIENT_CREATE]: Priority.ROUTINE,
  [QueueKinds.ANC_VISIT_CREATE]: Priority.ROUTINE,
  [QueueKinds.HOUSEHOLD_CREATE]: Priority.ROUTINE,
  [QueueKinds.GROWTH_RECORD_CREATE]: Priority.ROUTINE,
};

export function getPriority(kind) {
  return KIND_PRIORITY[kind] || Priority.ROUTINE;
}

export const QueueKindInfo = {
  [QueueKinds.PATIENT_CREATE]:   { entityLabel: 'Patient',   actionLabel: 'New patient record', icon: 'person-add-outline' },
  [QueueKinds.CASE_CREATE]:      { entityLabel: 'Case',      actionLabel: 'New emergency case',  icon: 'alert-circle-outline' },
  [QueueKinds.REFERRAL_CREATE]:  { entityLabel: 'Referral',  actionLabel: 'New referral',        icon: 'swap-horizontal-outline' },
  [QueueKinds.ANC_VISIT_CREATE]: { entityLabel: 'ANC Visit', actionLabel: 'New ANC visit',       icon: 'medkit-outline' },
  [QueueKinds.HOUSEHOLD_CREATE]:      { entityLabel: 'Household',     actionLabel: 'New household',       icon: 'home-outline' },
  [QueueKinds.GROWTH_RECORD_CREATE]:  { entityLabel: 'Growth Record', actionLabel: 'New growth record',   icon: 'body-outline' },
};

/** True once a queued item has exhausted retries and needs a human to look at it. */
export function isQueueItemFailed(item) {
  return item.retries >= MAX_RETRIES;
}

let memoryQueue = null; // lazy-loaded cache, mirrors AsyncStorage
const listeners = new Set();
let idCounter = 0;

async function loadQueue() {
  if (memoryQueue) return memoryQueue;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    memoryQueue = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('[offlineQueue] failed to load queue, resetting:', e);
    memoryQueue = [];
  }
  return memoryQueue;
}

async function persistQueue() {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(memoryQueue));
  } catch (e) {
    console.error('[offlineQueue] failed to persist queue:', e);
  }
  listeners.forEach((fn) => fn([...memoryQueue]));
}

/** Subscribe to queue changes. Returns an unsubscribe function. */
export function subscribeQueue(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function makeId() {
  idCounter += 1;
  return `q_${Date.now()}_${idCounter}`;
}

/**
 * A request is "offline-shaped" if it failed with no response at all —
 * that's axios's signature for a network/timeout failure, as opposed to
 * a 4xx/5xx which means the server was reachable and rejected the request.
 * Only the former belongs in the retry queue.
 */
export function isNetworkError(err) {
  return !err?.response;
}

/**
 * Queue a mutation for later sync.
 * @param {object} opts
 * @param {'post'|'patch'|'put'|'delete'} opts.method
 * @param {string} opts.url - path passed to apiClient (e.g. '/api/cases/patients/')
 * @param {object} [opts.data]
 * @param {object} [opts.meta] - arbitrary context for the UI, e.g. { kind: 'patient_create', label: 'Ama Boateng' }
 */
export async function enqueueMutation({ method, url, data, meta = {} }) {
  await loadQueue();
  const item = {
    id: makeId(),
    method,
    url,
    data,
    meta: { ...meta, priority: meta.priority || getPriority(meta.kind) },
    createdAt: Date.now(),
    retries: 0,
    lastError: null,
  };
  memoryQueue.push(item);
  await persistQueue();
  return item;
}

export async function getQueue() {
  return [...(await loadQueue())];
}

export async function removeFromQueue(id) {
  await loadQueue();
  memoryQueue = memoryQueue.filter((i) => i.id !== id);
  await persistQueue();
}

export async function clearQueue() {
  memoryQueue = [];
  await persistQueue();
}

let isProcessing = false;

/**
 * Drain the queue in FIFO order (oldest write first, so record creates
 * happen before edits that depend on them). Stops as soon as a network
 * error reappears — that means the device dropped offline again mid-sync,
 * so there's no point hammering the rest of the queue.
 *
 * Non-network failures (validation errors, 409s, etc.) are NOT silently
 * dropped: the item stays queued with the error attached so the UI can
 * show the person what needs attention, up to MAX_RETRIES, after which
 * it's flagged failed but still left for manual review — never auto-deleted.
 */
export async function processQueue({ onItemSynced, onItemFailed } = {}) {
  if (isProcessing) return { synced: 0, failed: 0 };
  isProcessing = true;
  let synced = 0;
  let failed = 0;
  try {
    await loadQueue();
    // HIGH-priority items (emergency cases, referrals) drain first — a
    // stuck referral sitting behind a batch of routine ANC visits in FIFO
    // order is exactly the kind of delay item 5 exists to avoid. Within a
    // priority tier, original FIFO order (oldest first) is preserved.
    const items = [...memoryQueue].sort((a, b) => {
      const pa = a.meta?.priority === Priority.HIGH ? 0 : 1;
      const pb = b.meta?.priority === Priority.HIGH ? 0 : 1;
      return pa - pb || a.createdAt - b.createdAt;
    });
    for (const item of items) {
      if (item.retries >= MAX_RETRIES) continue; // needs manual review, skip auto-retry

      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await apiClient.request({ method: item.method, url: item.url, data: item.data });
        memoryQueue = memoryQueue.filter((i) => i.id !== item.id);
        // eslint-disable-next-line no-await-in-loop
        await persistQueue();
        synced += 1;
        onItemSynced?.(item, res.data);
      } catch (err) {
        item.retries += 1;
        item.lastError =
          err.response?.data?.detail ||
          err.response?.data?.message ||
          err.message ||
          'Sync failed';
        // eslint-disable-next-line no-await-in-loop
        await persistQueue();
        failed += 1;
        onItemFailed?.(item, err);
        if (isNetworkError(err)) break; // offline again — stop draining, wait for next trigger
      }
    }
  } finally {
    isProcessing = false;
  }
  return { synced, failed };
}
