/**
 * src/components/sync/SyncQueueBell.jsx
 * -----------------------------------------------------
 * Mirrors NotificationBell: a floating icon mounted once, globally, in
 * RootNavigator, present on every screen. Exists so "what's queued" is
 * never something a person has to guess or dig for — one tap from
 * anywhere in the app shows every write that hasn't reached the server
 * yet, why, and what to do about it.
 *
 * Always rendered (not just when something's queued) — an icon that only
 * appears sometimes is easy to mistake for a bug ("where did that go?").
 * A steady, always-in-the-same-place icon that's quiet when empty and
 * badged when not is what makes the sync state legible at a glance.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal as RNModal, Pressable, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOfflineQueue } from '../../contexts/OfflineQueueContext';
import { QueueKindInfo, MAX_RETRIES, isQueueItemFailed, removeFromQueue } from '../../utils/offlineQueue';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

const timeAgo = (ts) => {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

function QueueRow({ item, onDiscard }) {
  const info = QueueKindInfo[item.meta?.kind] || { entityLabel: 'Record', actionLabel: 'Change', icon: 'document-outline' };
  const failed = isQueueItemFailed(item);

  const confirmDiscard = () => {
    Alert.alert(
      'Discard this record?',
      `"${item.meta?.label || info.entityLabel}" will be permanently removed and will not be sent to the server.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => onDiscard(item.id) },
      ]
    );
  };

  return (
    <View style={[styles.row, failed && styles.rowFailed]}>
      <View style={[styles.rowIcon, { backgroundColor: failed ? Colors.dangerLight : Colors.warningLight }]}>
        <Ionicons name={info.icon} size={17} color={failed ? Colors.dangerDark : Colors.warningDark} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.meta?.label || info.entityLabel}</Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>{info.actionLabel} · {timeAgo(item.createdAt)}</Text>
        <Text style={[styles.rowStatus, failed && { color: Colors.dangerDark }]} numberOfLines={2}>
          {failed
            ? `Couldn't send after ${MAX_RETRIES} tries: ${item.lastError || 'unknown error'}`
            : item.retries > 0
              ? `Waiting to retry (attempt ${item.retries})`
              : 'Waiting for connection'}
        </Text>
      </View>
      <TouchableOpacity onPress={confirmDiscard} style={styles.discardBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="trash-outline" size={16} color={Colors.gray400} />
      </TouchableOpacity>
    </View>
  );
}

export default function SyncQueueBell() {
  const insets = useSafeAreaInsets();
  const { pending, isOnline, syncing, sync } = useOfflineQueue();
  const [open, setOpen] = useState(false);

  const failed = pending.filter(isQueueItemFailed);
  const waiting = pending.filter((i) => !isQueueItemFailed(i));
  const count = pending.length;

  const handleDiscard = async (id) => {
    try {
      await removeFromQueue(id);
    } catch {
      Alert.alert('Could not discard', 'Please try again.');
    }
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.fab, { top: insets.top + Spacing[3] }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
      >
        <Ionicons
          name={isOnline ? 'sync-outline' : 'cloud-offline-outline'}
          size={20}
          color={count > 0 ? Colors.warningDark : Colors.textSecondary}
        />
        {count > 0 && (
          <View style={[styles.badge, failed.length > 0 && { backgroundColor: Colors.dangerDark }]}>
            <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
          </View>
        )}
      </TouchableOpacity>

      <RNModal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={[styles.panel, { marginTop: insets.top + Spacing[10] }]} onPress={() => {}}>
            <View style={styles.panelHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.panelTitle}>Sync Queue</Text>
                <Text style={styles.panelSubtitle}>
                  {isOnline ? 'Online' : 'Offline'} · {count} pending
                </Text>
              </View>
              {syncing ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <TouchableOpacity onPress={sync} style={styles.syncBtn} disabled={!isOnline || count === 0}>
                  <Ionicons name="refresh" size={13} color={Colors.primary} />
                  <Text style={styles.syncBtnText}>Sync now</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView style={{ maxHeight: 460 }}>
              {count === 0 && (
                <Text style={styles.emptyText}>Nothing queued — every record has reached the server.</Text>
              )}

              {failed.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Needs attention</Text>
                  {failed.map((item) => <QueueRow key={item.id} item={item} onDiscard={handleDiscard} />)}
                </>
              )}

              {waiting.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Waiting to sync</Text>
                  {waiting.map((item) => <QueueRow key={item.id} item={item} onDiscard={handleDiscard} />)}
                </>
              )}
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
    right: Spacing[4] + 48, // sits left of NotificationBell so both are always visible together
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
    backgroundColor: Colors.warningDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: Colors.white, fontSize: 9, fontWeight: Typography.bold },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)', alignItems: 'flex-end' },
  panel: {
    width: 340,
    maxWidth: '94%',
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
  panelSubtitle: { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: 1 },
  syncBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  syncBtnText: { fontSize: Typography.xs, color: Colors.primary, fontWeight: Typography.medium },
  emptyText: { fontSize: Typography.sm, color: Colors.gray400, textAlign: 'center', paddingVertical: Spacing[6], paddingHorizontal: Spacing[4] },
  sectionLabel: {
    fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.gray400,
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: Spacing[4], paddingTop: Spacing[3], paddingBottom: Spacing[1],
  },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[2],
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[3],
    borderBottomWidth: 1, borderBottomColor: '#f8fafc',
  },
  rowFailed: { backgroundColor: '#fef2f2' },
  rowIcon: {
    width: 30, height: 30, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  rowTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  rowSubtitle: { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: 1 },
  rowStatus: { fontSize: Typography.xs, color: Colors.warningDark, marginTop: 3 },
  discardBtn: { padding: 4, marginTop: 2 },
});
