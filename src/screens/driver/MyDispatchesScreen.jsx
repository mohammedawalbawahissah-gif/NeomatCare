import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { transportApi, getErrorMessage } from '../../api/client';
import { Spinner, EmptyState, ErrorBanner, Badge, Button } from '../../components/ui';
import { RequestStatusModal } from '../transport/TransportScreen';
import ReadAloudTrigger from '../../components/voice/ReadAloudBar';
import useReadAloud from '../../hooks/useReadAloud';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

const REQUEST_STATUS_VARIANT = { pending: 'warning', assigned: 'info', completed: 'success', cancelled: 'danger' };
const timeAgo = (d) => {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};
const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export default function MyDispatchesScreen() {
  const insets = useSafeAreaInsets();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [statusTarget, setStatusTarget] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const { data } = await transportApi.requests.mine();
      setRequests(Array.isArray(data) ? data : (data.results || []));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <Spinner fullScreen />;

  const active    = requests.filter((r) => !['completed', 'cancelled'].includes(r.status));
  const completed = requests.filter((r) => r.status === 'completed');

  const readAloudItems = active.map((r) => ({
    label: r.vehicle_registration || 'Dispatch',
    text: [
      `Vehicle ${r.vehicle_registration || 'not yet assigned'}.`,
      r.referral ? `Linked to a referral.` : '',
      r.requested_by_name ? `Requested by ${r.requested_by_name}, ${timeAgo(r.created_at)}.` : `Requested ${timeAgo(r.created_at)}.`,
      r.notes ? `Notes: ${r.notes}` : '',
    ].filter(Boolean).join(' '),
  }));
  const readAloud = useReadAloud(readAloudItems);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing[5] }]}>
        <Text style={styles.headerTitle}>My Dispatches</Text>
        <Text style={styles.headerSub}>{active.length} active</Text>
      </View>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      <ScrollView contentContainerStyle={{ padding: Spacing[4] }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}>
        {requests.length === 0 ? (
          <EmptyState icon="car-outline" title="No dispatches assigned yet" />
        ) : (
          <>
            {active.length > 0 && (
              <View style={{ marginBottom: Spacing[4] }}>
                <Text style={styles.groupLabel}>Active</Text>
                <ReadAloudTrigger readAloud={readAloud} />
                {active.map((r) => (
                  <View key={r.id} style={styles.card}>
                    <View style={styles.cardIcon}><Text style={{ fontSize: 18 }}>🚑</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{r.vehicle_registration || 'Vehicle TBD'}</Text>
                      {!!r.referral && <Text style={styles.referralText}>📋 Referral: {String(r.referral).slice(0, 8)}…</Text>}
                      <Text style={styles.cardMeta}>Requested {timeAgo(r.created_at)}{r.requested_by_name ? ` by ${r.requested_by_name}` : ''}</Text>
                      {!!r.notes && <Text style={styles.cardNotes}>{r.notes}</Text>}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <Badge label={r.status} variant={REQUEST_STATUS_VARIANT[r.status]} />
                      <Button title="Update" size="sm" variant="outline" onPress={() => setStatusTarget(r)} />
                    </View>
                  </View>
                ))}
              </View>
            )}

            {completed.length > 0 && (
              <View>
                <Text style={styles.groupLabel}>Completed</Text>
                {completed.map((r) => (
                  <View key={r.id} style={styles.card}>
                    <View style={styles.cardIcon}><Text style={{ fontSize: 18 }}>🚑</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitleMuted}>{r.vehicle_registration || 'Vehicle'}</Text>
                      <Text style={styles.cardMeta}>{fmtDate(r.updated_at)}</Text>
                    </View>
                    <Badge label={r.status} variant={REQUEST_STATUS_VARIANT[r.status]} />
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <RequestStatusModal
        visible={!!statusTarget} onClose={() => setStatusTarget(null)} request={statusTarget}
        onUpdated={(u) => { setRequests((prev) => prev.map((x) => (x.id === u.id ? u : x))); setStatusTarget(null); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing[4], paddingTop: Spacing[5], paddingBottom: Spacing[2] },
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  groupLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.gray400, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing[2] },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3], backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[3], marginBottom: Spacing[2], ...Shadow.sm },
  cardIcon: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: '#fffbeb', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  cardTitleMuted: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textSecondary },
  referralText: { fontSize: Typography.xs, color: Colors.primaryDark, fontWeight: Typography.medium, marginTop: 2 },
  cardMeta: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  cardNotes: { fontSize: Typography.xs, color: Colors.gray400, fontStyle: 'italic', marginTop: 2 },
});
