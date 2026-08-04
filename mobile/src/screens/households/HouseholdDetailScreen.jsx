import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { householdsApi, patientsApi, getErrorMessage } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Spinner, EmptyState, ErrorBanner, Badge, Modal, Input, Select, Button } from '../../components/ui';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

const RISK_VARIANT = { high: 'danger', medium: 'warning', low: 'success' };
const FOOD_SECURITY_OPTIONS = [
  { value: 'unknown',  label: 'Unknown' },
  { value: 'secure',   label: 'Secure' },
  { value: 'at_risk',  label: 'At risk' },
  { value: 'insecure', label: 'Insecure' },
];

function AttachPatientModal({ visible, onClose, householdId, onAttached }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const search = async (q) => {
    setQuery(q);
    if (!q) { setResults([]); return; }
    try {
      const { data } = await patientsApi.list({ q });
      setResults(Array.isArray(data) ? data : (data.results || []));
    } catch { /* keep results empty on failure */ }
  };

  const attach = async (patient) => {
    setSaving(true); setError('');
    try {
      await patientsApi.update(patient.id, { household: householdId });
      onAttached();
    } catch {
      setError('Failed to attach patient to this household.');
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Add Existing Patient" size="lg">
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <Input value={query} onChangeText={search} placeholder="Search by name, hospital ID, or phone…" icon="search-outline" />
      <ScrollView style={{ maxHeight: 320 }}>
        {results.map((p) => (
          <View key={p.id} style={styles.resultRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.resultName}>{p.patient_name}</Text>
              <Text style={styles.resultMeta}>{p.hospital_id || '—'} · Age {p.age}</Text>
            </View>
            <Button title="Add" onPress={() => attach(p)} loading={saving} size="sm" />
          </View>
        ))}
        {query && results.length === 0 && (
          <Text style={styles.noResults}>No matching patients.</Text>
        )}
      </ScrollView>
    </Modal>
  );
}

function EditFoodSecurityModal({ visible, onClose, household, onSaved }) {
  const [value, setValue] = useState(household?.food_security_flag || 'unknown');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await householdsApi.update(household.id, { food_security_flag: value });
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Food Security Status" size="md">
      <Select label="Food Security Status" value={value} onValueChange={setValue} options={FOOD_SECURITY_OPTIONS} />
      <Text style={styles.hint}>Scopes nutrition guidance for this household's children.</Text>
      <Button title="Save" onPress={save} loading={saving} fullWidth style={{ marginTop: Spacing[2] }} />
    </Modal>
  );
}

export default function HouseholdDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const insets = useSafeAreaInsets();
  const { isHealthWorker, isFacilityAdmin, isSuperadmin } = useAuth();
  const canEdit = isHealthWorker || isFacilityAdmin || isSuperadmin;

  const [household, setHousehold] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attachOpen, setAttachOpen] = useState(false);
  const [editFoodOpen, setEditFoodOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await householdsApi.detail(id);
      setHousehold(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <Spinner fullScreen />;
  if (error || !household) {
    return (
      <View style={styles.container}>
        <ErrorBanner message={error || 'Household not found.'} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing[16] }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{household.head_name || 'Unnamed household'}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing[4], paddingBottom: Spacing[10] }}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <Ionicons name="home" size={22} color={Colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryTown}>{household.town || 'Unknown town'}</Text>
            <Text style={styles.summaryFacility}>{household.facility_name || 'No facility'}</Text>
          </View>
          <Badge label={`${household.aggregate_risk_level} risk`} variant={RISK_VARIANT[household.aggregate_risk_level] || 'default'} />
        </View>

        <TouchableOpacity style={styles.foodCard} onPress={() => canEdit && setEditFoodOpen(true)} disabled={!canEdit}>
          <View style={{ flex: 1 }}>
            <Text style={styles.foodLabel}>Food security</Text>
            <Text style={styles.foodValue}>{household.food_security_flag.replace('_', ' ')}</Text>
          </View>
          {canEdit && <Ionicons name="create-outline" size={18} color={Colors.gray400} />}
        </TouchableOpacity>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Members</Text>
          {canEdit && (
            <TouchableOpacity onPress={() => setAttachOpen(true)} style={styles.addMemberBtn}>
              <Ionicons name="add" size={16} color={Colors.primary} />
              <Text style={styles.addMemberText}>Add Patient</Text>
            </TouchableOpacity>
          )}
        </View>

        {household.members.length === 0 ? (
          <EmptyState icon="people-outline" title="No members yet" message="Attach existing patients or register a new one and set their household." />
        ) : (
          household.members.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={styles.memberCard}
              onPress={() => navigation.navigate('PatientDetail', { id: m.id })}
            >
              <View style={styles.memberIcon}>
                <Ionicons name={m.patient_type === 'child' ? 'body-outline' : 'person-circle-outline'} size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{m.patient_name}</Text>
                <Text style={styles.memberMeta}>{m.patient_type} · Age {m.age}</Text>
              </View>
              <Badge label={`${m.risk_level} risk`} variant={RISK_VARIANT[m.risk_level] || 'default'} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <AttachPatientModal
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        householdId={household.id}
        onAttached={() => { setAttachOpen(false); load(); }}
      />
      <EditFoodSecurityModal
        visible={editFoodOpen}
        onClose={() => setEditFoodOpen(false)}
        household={household}
        onSaved={() => { setEditFoodOpen(false); load(); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[4], paddingTop: Spacing[5], paddingBottom: Spacing[3],
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: Typography.md, fontWeight: Typography.semibold, color: Colors.textPrimary },
  summaryCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], ...Shadow.sm, marginBottom: Spacing[3],
  },
  summaryIcon: {
    width: 44, height: 44, borderRadius: Radius.md, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  summaryTown: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  summaryFacility: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  foodCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white,
    borderRadius: Radius.lg, padding: Spacing[4], ...Shadow.sm, marginBottom: Spacing[4],
  },
  foodLabel: { fontSize: Typography.xs, color: Colors.gray400 },
  foodValue: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary, textTransform: 'capitalize', marginTop: 2 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing[2] },
  sectionTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  addMemberBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  addMemberText: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.primary },
  memberCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[3], ...Shadow.sm, marginBottom: Spacing[2],
  },
  memberIcon: {
    width: 34, height: 34, borderRadius: Radius.md, backgroundColor: Colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  memberName: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  memberMeta: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 1, textTransform: 'capitalize' },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing[2],
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  resultName: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  resultMeta: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 1 },
  noResults: { fontSize: Typography.xs, color: Colors.gray400, textAlign: 'center', paddingVertical: Spacing[4] },
  hint: { fontSize: Typography.xs, color: Colors.gray400, marginTop: Spacing[1] },
});
