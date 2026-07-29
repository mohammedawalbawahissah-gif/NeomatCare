/**
 * src/contexts/OfflineQueueContext.jsx
 *
 * Wires the offline queue engine (src/utils/offlineQueue.js) into the React
 * tree: tracks live connectivity, auto-drains the queue on reconnect and on
 * app foreground, and exposes `submitOrQueue` — the one function screens
 * should call for any write that needs offline support.
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import apiClient from '../api/client';
import {
  getQueue,
  subscribeQueue,
  processQueue,
  enqueueMutation,
  isNetworkError,
  Priority,
} from '../utils/offlineQueue';

const OfflineQueueContext = createContext(null);

export function OfflineQueueProvider({ children }) {
  const [pending, setPending] = useState([]);
  const [isOnline, setIsOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncVersion, setSyncVersion] = useState(0); // bumps only when something actually synced
  const syncingRef = useRef(false);

  useEffect(() => {
    getQueue().then(setPending);
    const unsubscribe = subscribeQueue(setPending);
    return unsubscribe;
  }, []);

  const sync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const result = await processQueue();
      if (result.synced > 0) setSyncVersion((v) => v + 1);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  // Reconnect trigger
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = !!state.isConnected && state.isInternetReachable !== false;
      setIsOnline(online);
      if (online) sync();
    });
    return unsubscribe;
  }, [sync]);

  // App-foreground trigger — catches the case where connectivity returned
  // while the app was backgrounded and no NetInfo event fired in-app
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') sync();
    });
    return () => sub.remove();
  }, [sync]);

  // Periodic retry — a request can land in the queue for reasons that have
  // nothing to do with the device actually losing connectivity (e.g. a
  // Render free-tier cold start taking longer than the 60s request timeout).
  // Since NetInfo never reported a drop, no reconnect event will fire to
  // trigger a re-sync, and the item would otherwise sit queued until the
  // person happens to background/foreground the app. This catches that case.
  //
  // HIGH-priority items (emergency case/referral) get a much shorter
  // interval — "aggressive retry" from the offline-first plan. A queued
  // ANC visit waiting 45s longer is a non-issue; a queued referral is not.
  useEffect(() => {
    if (pending.length === 0) return undefined;
    const hasHighPriority = pending.some((i) => i.meta?.priority === Priority.HIGH);
    const interval = setInterval(() => sync(), hasHighPriority ? 15000 : 45000);
    return () => clearInterval(interval);
  }, [pending.length, pending, sync]);

  /**
   * Attempt a write live; if it fails because the device is offline, queue
   * it instead of throwing. Any other failure (validation, 403, 409, ...)
   * is a real error and is re-thrown so the screen can show it — queuing a
   * request the server has already rejected would just fail again forever.
   *
   * @returns {Promise<{queued: boolean, response?: object, item?: object}>}
   */
  const submitOrQueue = useCallback(async ({ method, url, data, meta }) => {
    try {
      const response = await apiClient.request({ method, url, data });
      return { queued: false, response };
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      const item = await enqueueMutation({ method, url, data, meta });
      return { queued: true, item };
    }
  }, []);

  const value = { pending, pendingCount: pending.length, isOnline, syncing, syncVersion, sync, submitOrQueue };

  return (
    <OfflineQueueContext.Provider value={value}>
      {children}
    </OfflineQueueContext.Provider>
  );
}

export function useOfflineQueue() {
  const ctx = useContext(OfflineQueueContext);
  if (!ctx) throw new Error('useOfflineQueue must be used within an OfflineQueueProvider');
  return ctx;
}
