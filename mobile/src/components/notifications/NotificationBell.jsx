/**
 * src/components/notifications/NotificationBell.jsx
 * -----------------------------------------------------
 * Mirrors web's notification bell in AppLayout.jsx: unread badge, 30s
 * polling, tap-to-open panel, mark-one-read on tap, mark-all-read button.
 * Mounted once, globally, in RootNavigator (same pattern as AssistantWidget)
 * so it's present on every screen for every role — matching web, where the
 * bell lives in the persistent topbar regardless of which page is active.
 *
 * Deep-linking a notification tap to the exact target screen is best-effort:
 * web can navigate(n.url) directly since it's a router path, but RN screens
 * aren't addressable by URL string. We parse the few URL shapes the backend
 * actually generates (see apps/notifications + apps/cases/views.py) and fall
 * back to just closing the panel (still marks read) for anything unrecognized
 * rather than crashing or guessing wrong.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal as RNModal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { navigationRef } from '../../navigation/navigationRef';
import { notificationsApi } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

const timeAgo = (iso) => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

// Best-effort url -> mobile navigation. Returns true if it handled navigation.
function tryNavigate(role, url) {
  if (!url || !navigationRef.isReady()) return false;
  const nav = { navigate: (name, params) => navigationRef.navigate(name, params) };
  try {
    let m;
    if ((m = url.match(/\/app\/referrals\/([a-f0-9-]+)/i))) {
      const target = role === 'specialist' ? 'Referrals' : 'MenuTab';
      const params = role === 'specialist'
        ? { screen: 'ReferralDetail', params: { id: m[1] } }
        : { screen: 'Referrals', params: { screen: 'ReferralDetail', params: { id: m[1] } } };
      nav.navigate(target, params);
      return true;
    }
    if ((m = url.match(/\/app\/cases\/([a-f0-9-]+)/i))) {
      const target = role === 'driver' ? null : 'MenuTab';
      if (!target) return false;
      nav.navigate('MenuTab', { screen: 'CasesTab', params: { screen: 'CaseDetail', params: { id: m[1] } } });
      return true;
    }
    if ((m = url.match(/\/app\/consultations\/([a-f0-9-]+)/i))) {
      const target = role === 'specialist' ? 'Consultations' : 'MenuTab';
      const params = role === 'specialist'
        ? { screen: 'ConsultationDetail', params: { id: m[1] } }
        : { screen: 'Consultations', params: { screen: 'ConsultationDetail', params: { id: m[1] } } };
      nav.navigate(target, params);
      return true;
    }
    if (url.includes('/app/patient-portal')) {
      nav.navigate('Dashboard');
      return true;
    }
    if (url.includes('/app/transport')) {
      nav.navigate(role === 'driver' ? 'MenuTab' : 'MenuTab', { screen: 'Transport' });
      return true;
    }
  } catch {
    // Navigation shape didn't match this role's tree — fall through to no-op.
  }
  return false;
}

export default function NotificationBell() {
  const insets = useSafeAreaInsets();
  const { role } = useAuth();

  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef(null);

  const refreshUnreadCount = useCallback(() => {
    notificationsApi.unreadCount()
      .then(({ data }) => setUnreadCount(data.unread_count))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshUnreadCount();
    intervalRef.current = setInterval(refreshUnreadCount, 30000);
    return () => clearInterval(intervalRef.current);
  }, [refreshUnreadCount]);

  const openPanel = () => {
    setOpen(true);
    setLoading(true);
    notificationsApi.list()
      .then(({ data }) => setNotifications(data.results || data))
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  };

  const handleNotificationPress = async (n) => {
    if (!n.is_read) {
      try {
        await notificationsApi.markRead(n.id);
        setUnreadCount((c) => Math.max(0, c - 1));
        setNotifications((list) => list.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      } catch { /* keep panel state as-is if this fails */ }
    }
    setOpen(false);
    tryNavigate(role, n.url);
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      setUnreadCount(0);
      setNotifications((list) => list.map((x) => ({ ...x, is_read: true })));
    } catch { /* leave as-is; next poll will correct */ }
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.fab, { top: insets.top + Spacing[3] }]}
        onPress={openPanel}
        activeOpacity={0.8}
      >
        <Ionicons name="notifications-outline" size={20} color={Colors.textSecondary} />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      <RNModal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={[styles.panel, { marginTop: insets.top + Spacing[10] }]} onPress={() => {}}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Notifications</Text>
              {unreadCount > 0 && (
                <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllBtn}>
                  <Ionicons name="checkmark-done" size={14} color={Colors.primary} />
                  <Text style={styles.markAllText}>Mark all read</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView style={{ maxHeight: 420 }}>
              {loading && <Text style={styles.emptyText}>Loading…</Text>}
              {!loading && notifications.length === 0 && (
                <Text style={styles.emptyText}>No notifications yet</Text>
              )}
              {!loading && notifications.map((n) => (
                <TouchableOpacity
                  key={n.id}
                  style={[styles.notifRow, !n.is_read && styles.notifRowUnread]}
                  onPress={() => handleNotificationPress(n)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {!n.is_read && <View style={styles.dot} />}
                    <Text style={[styles.notifTitle, !n.is_read && styles.notifTitleUnread]} numberOfLines={1}>
                      {n.title}
                    </Text>
                  </View>
                  {!!n.message && <Text style={styles.notifMessage} numberOfLines={2}>{n.message}</Text>}
                  <Text style={styles.notifTime}>{timeAgo(n.created_at)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </RNModal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: Spacing[4],
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
    ...Shadow.sm,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: Colors.dangerDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: Colors.white, fontSize: 9, fontWeight: Typography.bold },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)', alignItems: 'flex-end' },
  panel: {
    width: 320,
    maxWidth: '92%',
    marginRight: Spacing[3],
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    ...Shadow.md,
    overflow: 'hidden',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  panelTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  markAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  markAllText: { fontSize: Typography.xs, color: Colors.primary, fontWeight: Typography.medium },
  emptyText: { fontSize: Typography.sm, color: Colors.gray400, textAlign: 'center', paddingVertical: Spacing[6] },
  notifRow: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  notifRowUnread: { backgroundColor: '#f0fdf4' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  notifTitle: { fontSize: Typography.sm, color: Colors.textSecondary, flexShrink: 1 },
  notifTitleUnread: { fontWeight: Typography.semibold, color: Colors.textPrimary },
  notifMessage: { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: 2, marginLeft: 12 },
  notifTime: { fontSize: 10, color: Colors.gray400, marginTop: 2, marginLeft: 12 },
});
