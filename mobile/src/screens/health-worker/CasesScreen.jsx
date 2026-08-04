import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { casesApi, getErrorMessage } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useOfflineQueue } from '../../contexts/OfflineQueueContext';
import { QueueKinds, isQueueItemFailed } from '../../utils/offlineQueue';
import { Spinner, EmptyState, ErrorBanner, Badge } from '../../components/ui';
import { DangerSignList } from '../../components/ui/dangerSigns';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function CasesScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isHealthWorker, isFacilityAdmin, isSuperadmin } = useAuth();
  const canCreate = isHealthWorker || isSuperadmin;
  const showCreator = isFacilityAdmin || isSuperadmin;

  const [cases, setCases]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState('');
  const { pending, syncVersion } = useOfflineQueue();

  const queuedCases = pending
    .filter((item) => item.meta?.kind === QueueKinds.CASE_CREATE)
    .map((item) => ({
      id: `queued:${item.id}`,
      __queued: true,
      __failed: isQueueItemFailed(item),
      patient_name: item.data.patient_name,
      patient_age: item.data.patient_age,
      gestational_age_weeks: item.data.gestational_age_weeks,
      danger_signs: item.data.danger_signs || [],
      created_by_name: null,
      referring_facility_name: null,
      created_at: item.createdAt,
    }));

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const { data } = await casesApi.list();
      setCases(Array.isArray(data) ? data : (data.results || []));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // A queued case disappears from `pending` the instant it syncs — refetch
  // immediately so the real record replaces it without a visible gap.
  useEffect(() => { if (syncVersion > 0) load(true); }, [syncVersion]);

  const renderItem = ({ item: c }) => {
    if (c.__queued) {
      return (
        <View style={[styles.card, styles.cardQueued]}>
          <View style={[styles.cardIcon, { backgroundColor: c.__failed ? Colors.dangerLight : Colors.warningLight }]}>
            <Ionicons name={c.__failed ? 'alert-circle-outline' : 'time-outline'} size={20} color={c.__failed ? Colors.dangerDark : Colors.warningDark} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.titleRow}>
              <Text style={styles.patientLine} numberOfLines={1}>
                {c.patient_name || 'Patient'} · {c.patient_age}y{c.gestational_age_weeks ? ` · ${c.gestational_age_weeks}wk` : ''}
              </Text>
              <Badge label={c.__failed ? 'Sync failed' : 'Pending sync'} variant={c.__failed ? 'danger' : 'warning'} />
            </View>
            <Text style={styles.metaText}>not yet on server · {timeAgo(new Date(c.created_at).toISOString())}</Text>
          </View>
        </View>
      );
    }

    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => navigation.navigate('CaseDetail', { id: c.id })}>
        <View style={styles.cardIcon}>
          <Ionicons name="alert-circle-outline" size={20} color={Colors.dangerDark} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={styles.patientLine} numberOfLines={1}>
              {c.patient_name || 'Patient'} · {c.patient_age}y{c.gestational_age_weeks ? ` · ${c.gestational_age_weeks}wk` : ''}
            </Text>
          </View>
          {showCreator && !!c.created_by_name && <Text style={styles.creatorText}>by {c.created_by_name}</Text>}
          <View style={{ marginTop: 4 }}>
            <DangerSignList signs={c.danger_signs} />
          </View>
          <Text style={styles.metaText}>
            {c.referring_facility_name} · {timeAgo(c.created_at)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const listData = [...queuedCases, ...cases];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing[16] }]}>
        <View>
          <Text style={styles.headerTitle}>Emergency Cases</Text>
          <Text style={styles.headerSub}>{cases.length} case{cases.length !== 1 ? 's' : ''}</Text>
        </View>
        {canCreate && (
          <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('CaseCreate')}>
            <Ionicons name="add" size={22} color={Colors.white} />
          </TouchableOpacity>
        )}
      </View>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {loading ? (
        <Spinner fullScreen />
      ) : listData.length === 0 ? (
        <EmptyState
          icon="clipboard-outline"
          title="No cases yet"
          message="Create a new emergency case to get started"
          action={canCreate ? { label: 'New Case', onPress: () => navigation.navigate('CaseCreate') } : null}
        />
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: Spacing[4], gap: Spacing[2] }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing[4], paddingTop: Spacing[5], paddingBottom: Spacing[2],
  },
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  headerSub:   { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  addBtn: {
    width: 36, height: 36, borderRadius: Radius.full, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', ...Shadow.sm,
  },
  card: {
    flexDirection: 'row', gap: Spacing[3],
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[3], ...Shadow.sm,
  },
  cardQueued: { borderWidth: 1, borderColor: Colors.warningLight, borderStyle: 'dashed' },
  cardIcon: {
    width: 36, height: 36, borderRadius: Radius.md, backgroundColor: Colors.dangerLight,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  titleRow:     { flexDirection: 'row', alignItems: 'center' },
  patientLine:  { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary, flex: 1 },
  creatorText:  { fontSize: Typography.xs, color: Colors.gray400, marginTop: 1 },
  metaText:     { fontSize: Typography.xs, color: Colors.gray400, marginTop: 6 },
});
