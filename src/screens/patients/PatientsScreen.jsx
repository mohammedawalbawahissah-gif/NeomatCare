import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { patientsApi, getErrorMessage } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useOfflineQueue } from '../../contexts/OfflineQueueContext';
import { QueueKinds, isQueueItemFailed } from '../../utils/offlineQueue';
import { Input, Select, Spinner, EmptyState, ErrorBanner, Badge } from '../../components/ui';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

const RISK_OPTIONS = [
  { value: '',       label: 'All risk levels' },
  { value: 'high',   label: 'High risk' },
  { value: 'medium', label: 'Medium risk' },
  { value: 'low',    label: 'Low risk' },
];
const RISK_VARIANT = { high: 'danger', medium: 'warning', low: 'success' };

export default function PatientsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isHealthWorker, isFacilityAdmin, isSuperadmin } = useAuth();
  const canCreate = isHealthWorker || isFacilityAdmin || isSuperadmin;
  const { pending, syncVersion } = useOfflineQueue();

  const [patients, setPatients] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [risk, setRisk]         = useState('');

  // Patients created while offline don't have a server id yet, so they
  // can't come back from patientsApi.list() — without this they'd simply
  // be invisible until the queue drains, which reads as data loss to
  // whoever just filled the form in. Render them as real rows, distinctly
  // marked, right where a synced patient would appear.
  const queuedPatients = pending
    .filter((item) => item.meta?.kind === QueueKinds.PATIENT_CREATE)
    .map((item) => ({
      id: `queued:${item.id}`,
      __queued: true,
      __failed: isQueueItemFailed(item),
      patient_name: item.data.patient_name,
      hospital_id: item.data.hospital_id,
      age: item.data.age,
      town: item.data.town,
      risk_level: null,
      consent_given: false,
      anc_visits: 0,
      case_count: 0,
      last_case_date: null,
    }));

  const load = useCallback(async (q = search, riskLevel = risk, isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const params = {};
      if (q) params.q = q;
      if (riskLevel) params.risk_level = riskLevel;
      const { data } = await patientsApi.list(params);
      setPatients(Array.isArray(data) ? data : (data.results || []));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, risk]);

  useFocusEffect(useCallback(() => { load(); }, []));

  // A queued patient disappears from `pending` the instant it syncs — refetch
  // immediately so the real record replaces it without a visible gap.
  useEffect(() => {
    if (syncVersion > 0) load(search, risk, true);
  }, [syncVersion]);

  const renderItem = ({ item: p }) => {
    if (p.__queued) {
      return (
        <View style={[styles.card, styles.cardQueued]}>
          <View style={[styles.cardIcon, { backgroundColor: p.__failed ? Colors.dangerLight : Colors.warningLight }]}>
            <Ionicons name={p.__failed ? 'alert-circle-outline' : 'time-outline'} size={22} color={p.__failed ? Colors.dangerDark : Colors.warningDark} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardName} numberOfLines={1}>{p.patient_name || 'Unnamed patient'}</Text>
              <Badge label={p.__failed ? 'Sync failed' : 'Pending sync'} variant={p.__failed ? 'danger' : 'warning'} />
            </View>
            <Text style={styles.cardMeta} numberOfLines={1}>
              ID: {p.hospital_id || '—'} · Age {p.age} · {p.town || 'Unknown town'} · not yet on server
            </Text>
          </View>
        </View>
      );
    }

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('PatientDetail', { id: p.id })}
      >
        <View style={styles.cardIcon}>
          <Ionicons name="person-circle-outline" size={24} color={Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardName} numberOfLines={1}>{p.patient_name || 'Unnamed patient'}</Text>
            <Badge label={`${p.risk_level || 'low'} risk`} variant={RISK_VARIANT[p.risk_level] || 'default'} />
            {p.consent_given && <Badge label="Consent" variant="info" />}
          </View>
          <Text style={styles.cardMeta} numberOfLines={1}>
            ID: {p.hospital_id || '—'} · Age {p.age} · {p.town || 'Unknown town'} · {p.anc_visits} ANC visit{p.anc_visits !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.caseCount}>{p.case_count} case{p.case_count !== 1 ? 's' : ''}</Text>
          <Text style={styles.caseDate}>{p.last_case_date ? new Date(p.last_case_date).toLocaleDateString() : 'No cases'}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const listData = [...queuedPatients, ...patients];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing[5] }]}>
        <Text style={styles.headerTitle}>Patients</Text>
        {canCreate && (
          <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('PatientCreate')}>
            <Ionicons name="add" size={22} color={Colors.white} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.searchRow}>
        <View style={{ flex: 1 }}>
          <Input
            value={search} onChangeText={setSearch}
            placeholder="Search by name, hospital ID, or phone…"
            icon="search-outline" returnKeyType="search"
            onSubmitEditing={() => load(search, risk)}
          />
        </View>
      </View>
      <Select
        value={risk}
        onValueChange={(v) => { setRisk(v); load(search, v); }}
        options={RISK_OPTIONS}
        placeholder="All risk levels"
      />

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {loading ? (
        <Spinner fullScreen />
      ) : listData.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No patients found"
          message="Try a different search, or create a new patient record."
          action={canCreate ? { label: 'New Patient', onPress: () => navigation.navigate('PatientCreate') } : null}
        />
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: Spacing[4], gap: Spacing[2] }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(search, risk, true)} />}
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
  addBtn: {
    width: 36, height: 36, borderRadius: Radius.full, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', ...Shadow.sm,
  },
  searchRow: { paddingHorizontal: Spacing[4] },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[3], ...Shadow.sm,
  },
  cardQueued: { borderWidth: 1, borderColor: Colors.warningLight, borderStyle: 'dashed' },
  cardIcon: {
    width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  cardName:  { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary, maxWidth: 140 },
  cardMeta:  { fontSize: Typography.xs, color: Colors.gray400, marginTop: 3 },
  caseCount: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textSecondary },
  caseDate:  { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
});
