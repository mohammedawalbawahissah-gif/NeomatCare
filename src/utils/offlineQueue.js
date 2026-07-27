/**
 * src/utils/offlineQueue.js
 *
 * Web mirror of the mobile app's offline queue (neomatcare-mobile/src/utils/offlineQueue.js).
 * Same shape, same semantics, same QueueKinds — deliberately, so a developer
 * moving between the two codebases doesn't have to learn two mental models.
 * Storage swaps AsyncStorage for localStorage (synchronous under the hood,
 * wrapped in promises to keep the same async API on both platforms) and the
 * mobile app's apiClient becomes this app's `api` axios instance.
 *
 * Scope (MVP): non-AI, non-file mutations only — same rationale as mobile.
 */
import { api } from '../api/client'

const QUEUE_KEY = 'nmc_offline_queue_v1'
const MAX_RETRIES = 5
export { MAX_RETRIES }

export const QueueKinds = {
  PATIENT_CREATE: 'patient_create',
  CASE_CREATE: 'case_create',
  REFERRAL_CREATE: 'referral_create',
  ANC_VISIT_CREATE: 'anc_visit_create',
  HOUSEHOLD_CREATE: 'household_create',
  GROWTH_RECORD_CREATE: 'growth_record_create',
}

export const QueueKindInfo = {
  [QueueKinds.PATIENT_CREATE]:   { entityLabel: 'Patient',   actionLabel: 'New patient record', icon: 'UserPlus' },
  [QueueKinds.CASE_CREATE]:      { entityLabel: 'Case',      actionLabel: 'New emergency case',  icon: 'AlertCircle' },
  [QueueKinds.REFERRAL_CREATE]:  { entityLabel: 'Referral',  actionLabel: 'New referral',        icon: 'ArrowLeftRight' },
  [QueueKinds.ANC_VISIT_CREATE]: { entityLabel: 'ANC Visit', actionLabel: 'New ANC visit',       icon: 'Stethoscope' },
}

export function isQueueItemFailed(item) {
  return item.retries >= MAX_RETRIES
}

let memoryQueue = null
const listeners = new Set()
let idCounter = 0

function loadQueue() {
  if (memoryQueue) return memoryQueue
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    memoryQueue = raw ? JSON.parse(raw) : []
  } catch (e) {
    console.error('[offlineQueue] failed to load queue, resetting:', e)
    memoryQueue = []
  }
  return memoryQueue
}

function persistQueue() {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(memoryQueue))
  } catch (e) {
    console.error('[offlineQueue] failed to persist queue:', e)
  }
  listeners.forEach((fn) => fn([...memoryQueue]))
}

/** Subscribe to queue changes. Returns an unsubscribe function. */
export function subscribeQueue(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function makeId() {
  idCounter += 1
  return `q_${Date.now()}_${idCounter}`
}

/**
 * A request is "offline-shaped" if axios reports no response at all — that's
 * its signature for a network/timeout failure, as opposed to a 4xx/5xx where
 * the server was reachable and rejected the request. Only the former belongs
 * in the retry queue.
 */
export function isNetworkError(err) {
  return !err?.response
}

/**
 * @param {object} opts
 * @param {'post'|'patch'|'put'|'delete'} opts.method
 * @param {string} opts.url
 * @param {object} [opts.data]
 * @param {object} [opts.meta] - e.g. { kind: QueueKinds.PATIENT_CREATE, label: 'Ama Boateng' }
 */
export async function enqueueMutation({ method, url, data, meta = {} }) {
  loadQueue()
  const item = {
    id: makeId(),
    method,
    url,
    data,
    meta,
    createdAt: Date.now(),
    retries: 0,
    lastError: null,
  }
  memoryQueue.push(item)
  persistQueue()
  return item
}

export async function getQueue() {
  return [...loadQueue()]
}

export async function removeFromQueue(id) {
  loadQueue()
  memoryQueue = memoryQueue.filter((i) => i.id !== id)
  persistQueue()
}

export async function clearQueue() {
  memoryQueue = []
  persistQueue()
}

let isProcessing = false

/**
 * Drain the queue in FIFO order. Stops as soon as a network error reappears
 * (device dropped offline again mid-sync). Non-network failures stay queued
 * with the error attached, up to MAX_RETRIES, then flagged failed but never
 * auto-deleted — a human decides what happens to those.
 */
export async function processQueue({ onItemSynced, onItemFailed } = {}) {
  if (isProcessing) return { synced: 0, failed: 0 }
  isProcessing = true
  let synced = 0
  let failed = 0
  try {
    loadQueue()
    const items = [...memoryQueue]
    for (const item of items) {
      if (item.retries >= MAX_RETRIES) continue

      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await api.request({ method: item.method, url: item.url, data: item.data })
        memoryQueue = memoryQueue.filter((i) => i.id !== item.id)
        persistQueue()
        synced += 1
        onItemSynced?.(item, res.data)
      } catch (err) {
        item.retries += 1
        item.lastError =
          err.response?.data?.detail ||
          err.response?.data?.message ||
          err.message ||
          'Sync failed'
        persistQueue()
        failed += 1
        onItemFailed?.(item, err)
        if (isNetworkError(err)) break
      }
    }
  } finally {
    isProcessing = false
  }
  return { synced, failed }
}
