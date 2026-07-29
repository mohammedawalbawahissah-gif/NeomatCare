import React, { useState, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { facilitiesApi, getErrorMessage } from '../../api/client';
import { Input, Select, Button, Modal, Spinner, Badge, ErrorBanner, EmptyState } from '../../components/ui';
import VoiceEntryBar, { VoiceEntryTrigger } from '../../components/voice/VoiceEntryBar';
import useVoiceEntry from '../../hooks/useVoiceEntry';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

const LEVEL_LABELS = { 1: 'CHPS Compound', 2: 'Health Centre', 3: 'District Hospital', 4: 'Regional Hospital', 5: 'Teaching Hospital', 6: 'Private Facility' };
const LEVEL_OPTIONS = Object.entries(LEVEL_LABELS).map(([v, l]) => ({ value: Number(v), label: `${v} – ${l}` }));

export default function FacilitiesScreen() {
  const insets = useSafeAreaInsets();
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState(null);
  const [createModal, setCreateModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    facilitiesApi.list()
      .then(({ data }) => setFacilities(Array.isArray(data) ? data : (data.results || [])))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = facilities.filter((f) => {
    const matchSearch = !search || f.name.toLowerCase().includes(search.toLowerCase()) || f.district?.toLowerCase().includes(search.toLowerCase());
    const matchLevel = !levelFilter || f.level === levelFilter;
    return matchSearch && matchLevel;
  });

  if (loading) return <Spinner fullScreen />;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing[16] }]}>
        <View>
          <Text style={styles.headerTitle}>Facilities Registry</Text>
          <Text style={styles.headerSub}>{facilities.length} facilities registered</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setCreateModal(true)}>
          <Ionicons name="add" size={22} color={Colors.white} />
        </TouchableOpacity>
      </View>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      <ScrollView contentContainerStyle={{ padding: Spacing[4] }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing[3] }}>
          <View style={{ flexDirection: 'row', gap: Spacing[2] }}>
            {Object.entries(LEVEL_LABELS).map(([l, label]) => (
              <TouchableOpacity
                key={l} style={[styles.levelChip, levelFilter === Number(l) && styles.levelChipActive]}
                onPress={() => setLevelFilter((v) => (v === Number(l) ? null : Number(l)))}
              >
                <Text style={styles.levelChipCount}>{facilities.filter((f) => f.level === Number(l)).length}</Text>
                <Text style={styles.levelChipLabel}>L{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <Input value={search} onChangeText={setSearch} placeholder="Search by name or district…" icon="search-outline" />

        {filtered.length === 0 ? (
          <EmptyState icon="business-outline" title="No facilities found" message="Try adjusting your search or add a new facility" />
        ) : filtered.map((f) => (
          <View key={f.id} style={styles.card}>
            <View style={styles.cardIcon}><Ionicons name="business" size={16} color={Colors.infoDark} /></View>
            <View style={{ flex: 1 }}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardName}>{f.name}</Text>
                <Badge label={`L${f.level} · ${LEVEL_LABELS[f.level]}`} variant="info" />
                {!f.is_active && <Badge label="Inactive" variant="default" />}
              </View>
              <Text style={styles.cardLocation}>📍 {[f.district, f.region].filter(Boolean).join(', ') || 'Location not set'}</Text>
              <View style={styles.featureRow}>
                <FeatureTag active={f.theatre_available} label="Theatre" />
                <FeatureTag active={f.blood_bank} label="Blood Bank" />
                <FeatureTag active={f.on_call_specialist} label="Specialist" />
              </View>
              <Text style={styles.bedText}>{f.icu_beds_available} ICU · {f.nicu_cots_available} NICU</Text>
            </View>
            <View style={{ gap: 6 }}>
              <TouchableOpacity style={styles.iconBtn} onPress={() => setEditTarget(f)}>
                <Ionicons name="create-outline" size={15} color={Colors.successDark} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.iconBtn, styles.iconBtnDanger]} onPress={() => setDeleteTarget(f)}>
                <Ionicons name="trash-outline" size={15} color={Colors.dangerDark} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      <FacilityFormModal visible={createModal} onClose={() => setCreateModal(false)} onSaved={(f) => { setFacilities((prev) => [f, ...prev]); setCreateModal(false); }} />
      <FacilityFormModal visible={!!editTarget} onClose={() => setEditTarget(null)} facility={editTarget} onSaved={(f) => { setFacilities((prev) => prev.map((x) => (x.id === f.id ? f : x))); setEditTarget(null); }} />
      <DeleteFacilityModal visible={!!deleteTarget} onClose={() => setDeleteTarget(null)} facility={deleteTarget} onDeleted={(id) => { setFacilities((prev) => prev.filter((x) => x.id !== id)); setDeleteTarget(null); }} />
    </View>
  );
}

function FeatureTag({ active, label }) {
  return (
    <View style={styles.featureTag}>
      <Ionicons name={active ? 'checkmark-circle' : 'close-circle'} size={11} color={active ? Colors.successDark : Colors.gray300} />
      <Text style={[styles.featureTagText, active && { color: Colors.successDark }]}>{label}</Text>
    </View>
  );
}

function FacilityFormModal({ visible, onClose, facility, onSaved }) {
  const isEdit = !!facility;
  const INITIAL = {
    name: '', level: 2, district: '', region: '', phone: '', latitude: '', longitude: '',
    icu_beds_available: '0', nicu_cots_available: '0',
    theatre_available: false, blood_bank: false, on_call_specialist: false, is_active: true,
  };
  const [form, setForm] = useState(INITIAL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setError('');
    setForm(facility ? {
      ...INITIAL, ...facility,
      latitude: String(facility.latitude), longitude: String(facility.longitude),
      icu_beds_available: String(facility.icu_beds_available), nicu_cots_available: String(facility.nicu_cots_available),
    } : INITIAL);
  }, [visible, facility]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const voiceFields = [
    { key: 'name', label: 'Facility Name', get: () => form.name, set: set('name') },
    { key: 'phone', label: 'Phone', get: () => form.phone, set: set('phone') },
    { key: 'district', label: 'District', get: () => form.district, set: set('district') },
    { key: 'region', label: 'Region', get: () => form.region, set: set('region') },
  ];
  const voiceEntry = useVoiceEntry(voiceFields);

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('Facility name is required.'); return; }
    if (!form.latitude || !form.longitude) { setError('Latitude and longitude are required.'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        name: form.name, level: Number(form.level), district: form.district, region: form.region, phone: form.phone,
        latitude: Number(form.latitude), longitude: Number(form.longitude),
        icu_beds_available: Number(form.icu_beds_available), nicu_cots_available: Number(form.nicu_cots_available),
        theatre_available: form.theatre_available, blood_bank: form.blood_bank,
        on_call_specialist: form.on_call_specialist, is_active: form.is_active,
        available_services: facility?.available_services || [],
      };
      const { data } = isEdit ? await facilitiesApi.update(facility.id, payload) : await facilitiesApi.create(payload);
      onSaved(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} onClose={onClose} title={isEdit ? 'Edit Facility' : 'Register New Facility'} size="lg">
      <ScrollView style={{ maxHeight: 480 }} keyboardShouldPersistTaps="handled">
        <ErrorBanner message={error} onDismiss={() => setError('')} />
        <VoiceEntryTrigger onPress={voiceEntry.start} count={voiceFields.length} />
        <Input label="Facility Name" required value={form.name} onChangeText={set('name')} placeholder="e.g. Korle-Bu Teaching Hospital" />
        <Select label="Level" required value={form.level} onValueChange={set('level')} options={LEVEL_OPTIONS} />
        <Input label="Phone" value={form.phone} onChangeText={set('phone')} placeholder="+233 ..." keyboardType="phone-pad" />
        <Input label="District" value={form.district} onChangeText={set('district')} placeholder="e.g. Accra Metro" />
        <Input label="Region" value={form.region} onChangeText={set('region')} placeholder="e.g. Greater Accra" />
        <Input label="Latitude" required value={form.latitude} onChangeText={set('latitude')} placeholder="e.g. 5.5502" keyboardType="decimal-pad" />
        <Input label="Longitude" required value={form.longitude} onChangeText={set('longitude')} placeholder="e.g. -0.2174" keyboardType="decimal-pad" />
        <Input label="ICU Beds" value={form.icu_beds_available} onChangeText={set('icu_beds_available')} keyboardType="number-pad" />
        <Input label="NICU Cots" value={form.nicu_cots_available} onChangeText={set('nicu_cots_available')} keyboardType="number-pad" />
        <View style={styles.toggleBox}>
          <ToggleRow label="Theatre" value={form.theatre_available} onChange={set('theatre_available')} />
          <ToggleRow label="Blood Bank" value={form.blood_bank} onChange={set('blood_bank')} />
          <ToggleRow label="On-call Specialist" value={form.on_call_specialist} onChange={set('on_call_specialist')} />
          {isEdit && <ToggleRow label="Active" value={form.is_active} onChange={set('is_active')} last />}
        </View>
      </ScrollView>
      <View style={styles.modalActions}>
        <Button title="Cancel" variant="outline" onPress={onClose} style={{ flex: 1 }} />
        <Button title={isEdit ? 'Save Changes' : 'Register Facility'} onPress={handleSubmit} loading={saving} style={{ flex: 2 }} />
      </View>
      <VoiceEntryBar voiceEntry={voiceEntry} />
    </Modal>
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

function DeleteFacilityModal({ visible, onClose, facility, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setDeleting(true); setError('');
    try {
      await facilitiesApi.delete(facility.id);
      onDeleted(facility.id);
    } catch {
      setError('Failed to delete facility. Please try again.');
      setDeleting(false);
    }
  };

  if (!facility) return null;
  return (
    <Modal visible={visible} onClose={onClose} title="Delete Facility?">
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <Text style={styles.deleteBody}>Are you sure you want to delete <Text style={{ fontWeight: Typography.bold }}>{facility.name}</Text>? This action cannot be undone.</Text>
      <View style={styles.modalActions}>
        <Button title="Cancel" variant="outline" onPress={onClose} style={{ flex: 1 }} />
        <Button title="Delete Facility" variant="danger" icon="trash-outline" onPress={handleDelete} loading={deleting} style={{ flex: 2 }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing[4], paddingTop: Spacing[5], paddingBottom: Spacing[2] },
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  addBtn: { width: 36, height: 36, borderRadius: Radius.full, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', ...Shadow.sm },
  levelChip: { alignItems: 'center', backgroundColor: Colors.white, borderRadius: Radius.md, paddingVertical: 8, paddingHorizontal: 14, ...Shadow.sm },
  levelChipActive: { borderWidth: 2, borderColor: Colors.primary },
  levelChipCount: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  levelChipLabel: { fontSize: 10, color: Colors.gray400, marginTop: 2 },
  card: { flexDirection: 'row', gap: Spacing[3], backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[3], marginTop: Spacing[3], ...Shadow.sm },
  cardIcon: { width: 36, height: 36, borderRadius: Radius.md, backgroundColor: Colors.infoLight, alignItems: 'center', justifyContent: 'center' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  cardName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  cardLocation: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 3 },
  featureRow: { flexDirection: 'row', gap: Spacing[3], marginTop: 6 },
  featureTag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  featureTagText: { fontSize: 10, color: Colors.gray300 },
  bedText: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 4 },
  iconBtn: { width: 28, height: 28, borderRadius: Radius.sm, backgroundColor: Colors.successLight, alignItems: 'center', justifyContent: 'center' },
  iconBtnDanger: { backgroundColor: Colors.dangerLight },
  toggleBox: { backgroundColor: Colors.gray50, borderRadius: Radius.md, paddingHorizontal: Spacing[3], marginTop: Spacing[2] },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  toggleLabel: { fontSize: Typography.sm, color: Colors.textSecondary },
  deleteBody: { fontSize: Typography.sm, color: Colors.textSecondary, marginBottom: Spacing[2] },
  modalActions: { flexDirection: 'row', gap: Spacing[2], marginTop: Spacing[3] },
});
