import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { patientsApi, wellnessApi, getErrorMessage } from '../../api/client';
import { useOfflineQueue } from '../../contexts/OfflineQueueContext';
import { QueueKinds } from '../../utils/offlineQueue';
import { Spinner, EmptyState, ErrorBanner, Modal, Input, Button } from '../../components/ui';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

function LogGrowthRecordModal({ visible, onClose, patientId, onSaved }) {
  const { submitOrQueue } = useOfflineQueue();
  const [form, setForm] = useState({
    record_date: new Date().toISOString().slice(0, 10),
    weight_kg: '', muac_cm: '', height_cm: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const payload = { record_date: form.record_date, notes: form.notes };
      if (form.weight_kg) payload.weight_kg = Number(form.weight_kg);
      if (form.muac_cm)   payload.muac_cm   = Number(form.muac_cm);
      if (form.height_cm) payload.height_cm = Number(form.height_cm);

      const result = await submitOrQueue({
        method: 'post',
        url: `/api/cases/patients/${patientId}/growth-records/`,
        data: payload,
        meta: { kind: QueueKinds.GROWTH_RECORD_CREATE, label: `Growth record — ${form.record_date}` },
      });

      if (result.queued) {
        onClose();
      } else {
        onSaved();
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Log Growth Record" size="lg">
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <Input label="Date" value={form.record_date} onChangeText={set('record_date')} placeholder="YYYY-MM-DD" />
      <Input label="Weight (kg)" value={form.weight_kg} onChangeText={set('weight_kg')} placeholder="e.g. 8.2" keyboardType="decimal-pad" />
      <Input label="MUAC (cm)" value={form.muac_cm} onChangeText={set('muac_cm')} placeholder="e.g. 13.5" keyboardType="decimal-pad" />
      <Input label="Height (cm)" value={form.height_cm} onChangeText={set('height_cm')} placeholder="Optional" keyboardType="decimal-pad" />
      <Input label="Notes" value={form.notes} onChangeText={set('notes')} placeholder="Optional" multiline numberOfLines={2} />
      <Button title="Save Entry" onPress={handleSave} loading={saving} fullWidth style={{ marginTop: Spacing[2] }} />
    </Modal>
  );
}

export default function ChildGrowthScreen({ route, navigation }) {
  const { id, patientName } = route.params;
  const insets = useSafeAreaInsets();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [logOpen, setLogOpen] = useState(false);

  const [guidance, setGuidance] = useState(null);
  const [guidanceLoading, setGuidanceLoading] = useState(true);
  const [guidanceUnavailable, setGuidanceUnavailable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await patientsApi.growthRecords.list(id);
      setRecords(Array.isArray(data) ? data : (data.results || []));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally { setLoading(false); }
  }, [id]);

  const loadGuidance = useCallback(async () => {
    setGuidanceLoading(true);
    setGuidanceUnavailable(false);
    try {
      const { data } = await wellnessApi.childNutrition(id);
      setGuidance(data);
    } catch {
      setGuidanceUnavailable(true);
    } finally { setGuidanceLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); loadGuidance(); }, [load, loadGuidance]));

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing[16] }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{patientName}</Text>
        <TouchableOpacity onPress={() => setLogOpen(true)} style={styles.logBtn}>
          <Ionicons name="add" size={20} color={Colors.white} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing[4], paddingBottom: Spacing[10] }}>
        <ErrorBanner message={error} onDismiss={() => setError('')} />

        {guidanceLoading ? (
          <Spinner />
        ) : guidanceUnavailable ? (
          <View style={styles.unavailableCard}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.gray400} />
            <Text style={styles.unavailableText}>
              No date of birth or age on file for this child yet — add one on the patient record to unlock age-appropriate guidance.
            </Text>
          </View>
        ) : guidance && (
          <>
            <View style={styles.guidanceCard}>
              <View style={styles.guidanceHeaderRow}>
                <Ionicons name="sparkles-outline" size={18} color={Colors.successDark} />
                <Text style={styles.guidanceTitle}>Feeding guidance — {guidance.age_band}</Text>
              </View>
              {guidance.guidance_scope === 'resource_limited' && (
                <View style={styles.scopeBadge}>
                  <Text style={styles.scopeBadgeText}>Resource-limited household</Text>
                </View>
              )}
              {guidance.feeding_tips.map((tip, i) => (
                <View key={i} style={styles.tipRow}>
                  <Text style={styles.tipBullet}>•</Text>
                  <Text style={styles.tipText}>{tip}</Text>
                </View>
              ))}
            </View>

            <View style={styles.dangerCard}>
              <View style={styles.guidanceHeaderRow}>
                <Ionicons name="warning-outline" size={18} color={Colors.dangerDark} />
                <Text style={styles.dangerTitle}>Seek care immediately if you see</Text>
              </View>
              {guidance.danger_signs.map((sign, i) => (
                <View key={i} style={styles.tipRow}>
                  <Text style={[styles.tipBullet, { color: Colors.dangerDark }]}>•</Text>
                  <Text style={[styles.tipText, { color: Colors.dangerDark }]}>{sign}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Growth Log</Text>
        {loading ? (
          <Spinner />
        ) : records.length === 0 ? (
          <EmptyState icon="body-outline" title="No growth records yet" message="Log a weight or MUAC entry from a home visit or facility check." />
        ) : (
          records.map((r) => (
            <View key={r.id} style={styles.recordCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.recordDate}>{new Date(r.record_date).toLocaleDateString()}</Text>
                <Text style={styles.recordMeta}>{r.facility_name || 'No facility'} · {r.recorded_by_name || 'Unknown'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: Spacing[1] }}>
                {r.weight_kg != null && <Text style={styles.recordValue}>{r.weight_kg} kg</Text>}
                {r.muac_cm != null && <Text style={styles.recordValue}>MUAC {r.muac_cm} cm</Text>}
                {r.muac_classification && (
                  <View style={[
                    styles.muacBadge,
                    r.muac_classification.band === 'red' ? styles.muacBadgeRed
                      : r.muac_classification.band === 'yellow' ? styles.muacBadgeYellow
                      : styles.muacBadgeGreen,
                  ]}>
                    {r.muac_classification.band === 'red' && (
                      <Ionicons name="warning" size={11} color="#b91c1c" style={{ marginRight: 3 }} />
                    )}
                    <Text style={[
                      styles.muacBadgeText,
                      r.muac_classification.band === 'red' ? { color: '#b91c1c' }
                        : r.muac_classification.band === 'yellow' ? { color: '#b45309' }
                        : { color: '#047857' },
                    ]}>
                      {r.muac_classification.label}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <LogGrowthRecordModal
        visible={logOpen}
        onClose={() => setLogOpen(false)}
        patientId={id}
        onSaved={() => { setLogOpen(false); load(); }}
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
  logBtn: {
    width: 36, height: 36, borderRadius: Radius.full, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  unavailableCard: {
    flexDirection: 'row', gap: Spacing[2], backgroundColor: Colors.gray50, borderRadius: Radius.lg,
    padding: Spacing[3], marginBottom: Spacing[3], borderWidth: 1, borderColor: Colors.gray200,
  },
  unavailableText: { flex: 1, fontSize: Typography.xs, color: Colors.gray500 },
  guidanceCard: {
    backgroundColor: Colors.successLight, borderRadius: Radius.lg, padding: Spacing[3],
    marginBottom: Spacing[3], borderWidth: 1, borderColor: '#bbf7d0',
  },
  dangerCard: {
    backgroundColor: Colors.dangerLight, borderRadius: Radius.lg, padding: Spacing[3],
    marginBottom: Spacing[4], borderWidth: 1, borderColor: '#fecaca',
  },
  guidanceHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing[2] },
  guidanceTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.successDark },
  dangerTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.dangerDark },
  scopeBadge: {
    alignSelf: 'flex-start', backgroundColor: Colors.warningLight, borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 2, marginBottom: Spacing[2],
  },
  scopeBadgeText: { fontSize: 10, fontWeight: Typography.semibold, color: Colors.warningDark, textTransform: 'uppercase' },
  tipRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  tipBullet: { fontSize: Typography.xs, color: Colors.successDark },
  tipText: { flex: 1, fontSize: Typography.xs, color: Colors.successDark },
  sectionTitle: {
    fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.gray400,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing[2],
  },
  recordCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white,
    borderRadius: Radius.lg, padding: Spacing[3], ...Shadow.sm, marginBottom: Spacing[2],
  },
  recordDate: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  recordMeta: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  recordValue: { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: Typography.medium },
  muacBadge: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing[2], paddingVertical: 2,
    borderRadius: Radius.full, borderWidth: 1,
  },
  muacBadgeRed:    { backgroundColor: '#fee2e2', borderColor: '#fecaca' },
  muacBadgeYellow: { backgroundColor: '#fef3c7', borderColor: '#fde68a' },
  muacBadgeGreen:  { backgroundColor: '#d1fae5', borderColor: '#a7f3d0' },
  muacBadgeText: { fontSize: 10, fontWeight: Typography.bold },
});
