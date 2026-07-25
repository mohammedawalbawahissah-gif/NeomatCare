/**
 * src/contexts/OfflineQueueContext.jsx
 * Web mirror of neomatcare-mobile/src/contexts/OfflineQueueContext.jsx.
 * Same exposed shape (pending, pendingCount, isOnline, syncing, syncVersion,
 * sync, submitOrQueue) so a page written against this context reads the same
 * way a screen written against the mobile one does. Connectivity comes from
 * the browser's online/offline events + navigator.onLine instead of NetInfo;
 * the foreground trigger is the Page Visibility API instead of AppState.
 */
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { api } from '../api/client'
import {
  getQueue,
  subscribeQueue,
  processQueue,
  enqueueMutation,
  isNetworkError,
} from '../utils/offlineQueue'

const OfflineQueueContext = createContext(null)

export function OfflineQueueProvider({ children }) {
  const [pending, setPending] = useState([])
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [syncing, setSyncing] = useState(false)
  const [syncVersion, setSyncVersion] = useState(0)
  const syncingRef = useRef(false)

  useEffect(() => {
    getQueue().then(setPending)
    const unsubscribe = subscribeQueue(setPending)
    return unsubscribe
  }, [])

  const sync = useCallback(async () => {
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    try {
      const result = await processQueue()
      if (result.synced > 0) setSyncVersion((v) => v + 1)
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }, [])

  // Reconnect trigger
  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); sync() }
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [sync])

  // Periodic retry — a request can land in the queue for reasons that have
  // nothing to do with the browser actually going offline (e.g. a Render
  // free-tier cold start taking longer than the request timeout). Since the
  // browser's connection never dropped, no 'online' event will ever fire to
  // trigger a re-sync, and the item would otherwise sit queued indefinitely
  // until the person happens to switch tabs. This catches that case.
  useEffect(() => {
    if (pending.length === 0) return undefined
    const interval = setInterval(() => sync(), 45000)
    return () => clearInterval(interval)
  }, [pending.length, sync])

  // Tab-foreground trigger — catches connectivity that returned while the
  // tab was backgrounded/asleep and no 'online' event fired
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') sync()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [sync])

  /**
   * Attempt a write live; if it fails because the browser is offline, queue
   * it instead of throwing. Any other failure (validation, 403, 409, ...) is
   * a real error and is re-thrown — queuing a request the server already
   * rejected would just fail again forever.
   */
  const submitOrQueue = useCallback(async ({ method, url, data, meta }) => {
    try {
      const response = await api.request({ method, url, data })
      return { queued: false, response }
    } catch (err) {
      if (!isNetworkError(err)) throw err
      const item = await enqueueMutation({ method, url, data, meta })
      return { queued: true, item }
    }
  }, [])

  const value = { pending, pendingCount: pending.length, isOnline, syncing, syncVersion, sync, submitOrQueue }

  return (
    <OfflineQueueContext.Provider value={value}>
      {children}
    </OfflineQueueContext.Provider>
  )
}

export function useOfflineQueue() {
  const ctx = useContext(OfflineQueueContext)
  if (!ctx) throw new Error('useOfflineQueue must be used within an OfflineQueueProvider')
  return ctx
}
