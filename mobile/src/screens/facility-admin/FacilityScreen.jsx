import React, { useState, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { facilitiesApi, getErrorMessage } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Input, Button, Spinner, ErrorBanner, Card, StatCard, Badge } from '../../components/ui';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius } from '../../constants/theme';

const LEVEL_LABELS = { 1: 'CHPS Compound', 2: 'Health Centre', 3: 'District Hospital', 4: 'Regional Hospital', 5: 'Teaching Hospital', 6: 'Private Facility' };
const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export default function FacilityScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const facilityId = user?.facility_id || user?.facility;

  const [facility, setFacility] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [capacity, setCapacity] = useState({
    icu_beds_available: '0', nicu_cots_available: '0',
    theatre_available: false, blood_bank: false, on_call_specialist: false,
  });

  useEffect(() => {
    if (!facilityId) { setLoading(false); return; }
    Promise.all([facilitiesApi.detail(facilityId), facilitiesApi.capacityHistory(facilityId)])
      .then(([{ data: f }, { data: h }]) => {
        setFacility(f);
        setHistory(Array.isArray(h) ? h : (h.results || []));
        setCapacity({
          icu_beds_available: String(f.icu_beds_available), nicu_cots_available: String(f.nicu_cots_available),
          theatre_available: f.theatre_available, blood_bank: f.blood_bank, on_call_specialist: f.on_call_specialist,
        });
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [facilityId]);

  const handleSave = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const { data } = await facilitiesApi.updateCapacity(facilityId, {
        ...capacity, icu_beds_available: Number(capacity.icu_beds_available), nicu_cots_available: Number(capacity.nicu_cots_available),
      });
      setFacility(data.facility || data);
      setSuccess('Capacity updated successfully.');
      const { data: h } = await facilitiesApi.capacityHistory(facilityId);
      setHistory(Array.isArray(h) ? h : (h.results || []));
    } catch {
      setError('Failed to update capacity.');
    } finally { setSaving(false); }
  };

  if (loading) return <Spinner fullScreen />;
  if (!facilityId) return <View style={styles.container}><ErrorBanner message="Your account is not linked to a facility." /></View>;
  if (!facility) return <View style={styles.container}><ErrorBanner message={error || 'Facility not found.'} /></View>;

  const f = facility;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingHorizontal: Spacing[4], paddingTop: insets.top + Spacing[16], paddingBottom: Spacing[10] }}>
      <Text style={styles.title}>{f.name}</Text>
      <Text style={styles.subtitle}>{LEVEL_LABELS[f.level] || `Level ${f.level}`} · {f.district}{f.region ? `, ${f.region}` : ''}</Text>

      <View style={styles.statsGrid}>
        <StatCard label="ICU Beds" value={f.icu_beds_available} icon="medkit-outline" />
        <StatCard label="NICU Cots" value={f.nicu_cots_available} icon="body-outline" />
        <StatCard label="Theatre" value={f.theatre_available ? 'Available' : 'Unavailable'} icon={f.theatre_available ? 'checkmark-circle' : 'close-circle'} />
        <StatCard label="Blood Bank" value={f.blood_bank ? 'Available' : 'Unavailable'} icon={f.blood_bank ? 'checkmark-circle' : 'close-circle'} />
      </View>

      <Card>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Real-time Capacity</Text>
        </View>
        <Text style={styles.cardSub}>Updates are visible to the referral engine immediately</Text>

        <ErrorBanner message={error} onDismiss={() => setError('')} />
        {!!success && <View style={styles.successBox}><Text style={styles.successText}>{success}</Text></View>}

        <Input label="ICU Beds Available" value={capacity.icu_beds_available} onChangeText={(v) => setCapacity((c) => ({ ...c, icu_beds_available: v }))} keyboardType="number-pad" />
        <Input label="NICU Cots Available" value={capacity.nicu_cots_available} onChangeText={(v) => setCapacity((c) => ({ ...c, nicu_cots_available: v }))} keyboardType="number-pad" />

        <View style={styles.toggleBox}>
          <ToggleRow label="Theatre Available" value={capacity.theatre_available} onChange={(v) => setCapacity((c) => ({ ...c, theatre_available: v }))} />
          <ToggleRow label="Blood Bank" value={capacity.blood_bank} onChange={(v) => setCapacity((c) => ({ ...c, blood_bank: v }))} />
          <ToggleRow label="On-call Specialist" value={capacity.on_call_specialist} onChange={(v) => setCapacity((c) => ({ ...c, on_call_specialist: v }))} last />
        </View>

        <Button title="Save Capacity" icon="save-outline" onPress={handleSave} loading={saving} fullWidth style={{ marginTop: Spacing[3] }} />
      </Card>

      {f.available_services?.length > 0 && (
        <Card>
          <Text style={styles.cardTitle}>Available Services</Text>
          <View style={styles.servicesRow}>
            {f.available_services.map((s) => <Badge key={s} label={s.replace(/_/g, ' ')} variant="primary" />)}
          </View>
        </Card>
      )}

      <Card noPadding>
        <TouchableOpacity style={styles.historyToggle} onPress={() => setShowHistory((v) => !v)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="time-outline" size={16} color={Colors.gray400} />
            <Text style={styles.cardTitle}>Capacity History</Text>
            <View style={styles.countPill}><Text style={styles.countPillText}>{history.length}</Text></View>
          </View>
          <Text style={styles.showHideText}>{showHistory ? 'Hide' : 'Show'}</Text>
        </TouchableOpacity>
        {showHistory && (
          history.length === 0 ? (
            <Text style={styles.emptyText}>No changes recorded yet</Text>
          ) : history.slice(0, 20).map((h) => (
            <View key={h.id} style={styles.historyRow}>
              <Text style={styles.historyBy}>{h.changed_by_name || 'System'}</Text>
              <View style={styles.snapshotRow}>
                {Object.entries(h.snapshot).map(([k, v]) => (
                  <View key={k} style={styles.snapshotChip}><Text style={styles.snapshotText}>{k.replace(/_/g, ' ')}: <Text style={{ fontWeight: Typography.bold }}>{String(v)}</Text></Text></View>
                ))}
              </View>
              <Text style={styles.historyTime}>{fmtDate(h.timestamp)}</Text>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

function ToggleRow({ label, value, onChange, last }) {
  return (
    <View style={[styles.toggleRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: Colors.primary }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  title: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  subtitle: { fontSize: Typography.sm, color: Colors.gray400, marginTop: 2, marginBottom: Spacing[4] },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2], marginBottom: Spacing[3] },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  cardSub: { fontSize: Typography.xs, color: Colors.gray400, marginBottom: Spacing[3] },
  successBox: { backgroundColor: Colors.successLight, borderRadius: Radius.md, padding: Spacing[3], marginBottom: Spacing[3] },
  successText: { fontSize: Typography.sm, color: Colors.successDark },
  toggleBox: { backgroundColor: Colors.gray50, borderRadius: Radius.md, paddingHorizontal: Spacing[3] },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  toggleLabel: { fontSize: Typography.sm, color: Colors.textSecondary },
  servicesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  historyToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing[4] },
  countPill: { backgroundColor: Colors.gray100, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  countPillText: { fontSize: 10, color: Colors.gray400, fontWeight: Typography.medium },
  showHideText: { fontSize: Typography.xs, color: Colors.gray400 },
  emptyText: { fontSize: Typography.sm, color: Colors.gray400, textAlign: 'center', padding: Spacing[5] },
  historyRow: { padding: Spacing[4], borderTopWidth: 1, borderTopColor: Colors.gray100 },
  historyBy: { fontSize: Typography.xs, fontWeight: Typography.medium, color: Colors.textSecondary },
  snapshotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  snapshotChip: { backgroundColor: Colors.gray50, borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 3 },
  snapshotText: { fontSize: 10, color: Colors.gray400 },
  historyTime: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 6 },
});
