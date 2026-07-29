import React, { useState, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { consultationsApi, facilitiesApi, getErrorMessage } from '../../api/client';
import { Input, Select, Button, Modal, Spinner, Badge, ErrorBanner, EmptyState } from '../../components/ui';
import VoiceEntryBar, { VoiceEntryTrigger } from '../../components/voice/VoiceEntryBar';
import useVoiceEntry from '../../hooks/useVoiceEntry';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

const SPECIALTIES = [
  { value: 'obstetrics', label: 'Obstetrics' }, { value: 'gynecology', label: 'Gynaecology' },
  { value: 'neonatology', label: 'Neonatology' }, { value: 'midwifery', label: 'Midwifery' },
  { value: 'anaesthesiology', label: 'Anaesthesiology' }, { value: 'internal_medicine', label: 'Internal Medicine' },
  { value: 'emergency_medicine', label: 'Emergency Medicine' }, { value: 'other', label: 'Other' },
];
const SPECIALTY_LABEL = Object.fromEntries(SPECIALTIES.map((s) => [s.value, s.label]));

// Platform-wide by design: a specialist is not tied to one facility just to
// be manageable here. Assigning a `facility` on a profile is only ever an
// optional "home base" tag for display -- it has no bearing on which
// consultations a specialist can be matched to (see SpecialistSearchView,
// which searches all active specialist users regardless of facility).
export default function SpecialistsScreen() {
  const insets = useSafeAreaInsets();
  const [specialists, setSpecialists] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState(null);
  const [availOnly, setAvailOnly] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    Promise.all([consultationsApi.specialists.list(), facilitiesApi.list()])
      .then(([{ data: s }, { data: f }]) => {
        setSpecialists(Array.isArray(s) ? s : (s.results || []));
        setFacilities(Array.isArray(f) ? f : (f.results || []));
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const toggleAvailable = async (s) => {
    // Optimistic — this is a one-tap status flip an admin does often, and a
    // failed request self-corrects visibly (banner + revert) rather than
    // making every tap wait on a round trip.
    const next = !s.is_available;
    setSpecialists((prev) => prev.map((x) => (x.id === s.id ? { ...x, is_available: next } : x)));
    try {
      await consultationsApi.specialists.update(s.id, { is_available: next });
    } catch (err) {
      setSpecialists((prev) => prev.map((x) => (x.id === s.id ? { ...x, is_available: s.is_available } : x)));
      setError(getErrorMessage(err));
    }
  };

  const filtered = specialists.filter((s) => {
    const name = (s.user_name || '').toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase()) || s.professional_pin?.toLowerCase().includes(search.toLowerCase());
    const matchSpecialty = !specialtyFilter || s.specialty === specialtyFilter;
    const matchAvail = !availOnly || s.is_available;
    return matchSearch && matchSpecialty && matchAvail;
  });

  if (loading) return <Spinner fullScreen />;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing[16] }]}>
        <View>
          <Text style={styles.headerTitle}>Specialists</Text>
          <Text style={styles.headerSub}>{specialists.length} registered · {specialists.filter((s) => s.is_available).length} available</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setCreateModal(true)}>
          <Ionicons name="add" size={22} color={Colors.white} />
        </TouchableOpacity>
      </View>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      <ScrollView contentContainerStyle={{ padding: Spacing[4] }}>
        <Input value={search} onChangeText={setSearch} placeholder="Search by name or pin…" icon="search-outline" />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: Spacing[3] }}>
          <View style={{ flexDirection: 'row', gap: Spacing[2] }}>
            <TouchableOpacity style={[styles.filterChip, availOnly && styles.filterChipActive]} onPress={() => setAvailOnly((v) => !v)}>
              <Text style={[styles.filterChipText, availOnly && styles.filterChipTextActive]}>Available now</Text>
            </TouchableOpacity>
            {SPECIALTIES.map((s) => (
              <TouchableOpacity
                key={s.value} style={[styles.filterChip, specialtyFilter === s.value && styles.filterChipActive]}
                onPress={() => setSpecialtyFilter((v) => (v === s.value ? null : s.value))}
              >
                <Text style={[styles.filterChipText, specialtyFilter === s.value && styles.filterChipTextActive]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {filtered.length === 0 ? (
          <EmptyState
            icon="medkit-outline" title="No specialists found"
            message="Try adjusting your search or filters, or add a new specialist profile"
            action={{ label: 'Add Specialist', onPress: () => setCreateModal(true) }}
          />
        ) : filtered.map((s) => (
          <View key={s.id} style={styles.card}>
            <View style={styles.cardTopRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName}>{s.user_name || s.display_name}</Text>
                <Text style={styles.cardMeta}>{s.specialty_display || SPECIALTY_LABEL[s.specialty]} · {s.professional_pin}</Text>
              </View>
              <Switch value={s.is_available} onValueChange={() => toggleAvailable(s)} trackColor={{ true: Colors.primary }} />
            </View>
            {!!s.qualification && <Text style={styles.cardDetail}>🎓 {s.qualification}</Text>}
            {s.years_experience > 0 && <Text style={styles.cardDetail}>⏱ {s.years_experience} years experience</Text>}
            {!!s.facility && <Text style={styles.cardDetail}>🏥 {facilities.find((f) => f.id === s.facility)?.name || 'Facility assigned'}</Text>}
            {(!!s.specialist_phone || !!s.whatsapp_number) && (
              <Text style={styles.cardDetail}>📞 {s.specialist_phone || s.whatsapp_number}</Text>
            )}
            <View style={styles.cardActions}>
              <TouchableOpacity style={styles.iconBtn} onPress={() => setEditTarget(s)}>
                <Ionicons name="create-outline" size={15} color={Colors.successDark} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.iconBtn, styles.iconBtnDanger]} onPress={() => setDeleteTarget(s)}>
                <Ionicons name="trash-outline" size={15} color={Colors.dangerDark} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      <SpecialistFormModal
        visible={createModal} facilities={facilities} onClose={() => setCreateModal(false)}
        onSaved={(s) => { setSpecialists((prev) => [s, ...prev]); setCreateModal(false); }}
      />
      <SpecialistFormModal
        visible={!!editTarget} facilities={facilities} specialist={editTarget} onClose={() => setEditTarget(null)}
        onSaved={(s) => { setSpecialists((prev) => prev.map((x) => (x.id === s.id ? s : x))); setEditTarget(null); }}
      />
      <DeleteSpecialistModal
        visible={!!deleteTarget} specialist={deleteTarget} onClose={() => setDeleteTarget(null)}
        onDeleted={(id) => { setSpecialists((prev) => prev.filter((x) => x.id !== id)); setDeleteTarget(null); }}
      />
    </View>
  );
}

function SpecialistFormModal({ visible, facilities, specialist, onClose, onSaved }) {
  const isEdit = !!specialist;
  const INITIAL = {
    name: '', professional_pin: '', specialty: 'obstetrics', qualification: '', years_experience: '0',
    specialist_phone: '', specialist_email: '', whatsapp_number: '', emergency_contact: '', bio: '',
    is_available: true, facility: '',
  };
  const [form, setForm] = useState(INITIAL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setError('');
    setForm(specialist ? {
      ...INITIAL, ...specialist,
      name: specialist.user_name || specialist.display_name || '',
      years_experience: String(specialist.years_experience ?? 0),
      facility: specialist.facility || '',
    } : INITIAL);
  }, [visible, specialist]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const voiceFields = [
    { key: 'name', label: 'Specialist Name', get: () => form.name, set: set('name') },
    { key: 'professional_pin', label: 'Professional Pin', get: () => form.professional_pin, set: set('professional_pin') },
    { key: 'qualification', label: 'Qualification', get: () => form.qualification, set: set('qualification') },
    { key: 'specialist_phone', label: 'Phone', get: () => form.specialist_phone, set: set('specialist_phone') },
    { key: 'whatsapp_number', label: 'WhatsApp', get: () => form.whatsapp_number, set: set('whatsapp_number') },
    { key: 'emergency_contact', label: 'Emergency Contact', get: () => form.emergency_contact, set: set('emergency_contact') },
    { key: 'bio', label: 'Bio', get: () => form.bio, set: set('bio') },
  ];
  const voiceEntry = useVoiceEntry(voiceFields);

  const handleSubmit = async () => {
    if (!isEdit && !form.name.trim()) { setError('Specialist name is required.'); return; }
    if (!form.professional_pin.trim()) { setError('Professional pin is required.'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        ...(isEdit ? {} : { name: form.name }),
        professional_pin: form.professional_pin, specialty: form.specialty,
        qualification: form.qualification, years_experience: Number(form.years_experience) || 0,
        specialist_phone: form.specialist_phone, specialist_email: form.specialist_email,
        whatsapp_number: form.whatsapp_number, emergency_contact: form.emergency_contact,
        bio: form.bio, is_available: form.is_available, facility: form.facility || null,
      };
      const { data } = isEdit
        ? await consultationsApi.specialists.update(specialist.id, payload)
        : await consultationsApi.specialists.create(payload);
      onSaved(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} onClose={onClose} title={isEdit ? 'Edit Specialist' : 'Add Specialist Profile'} size="lg">
      <ScrollView style={{ maxHeight: 480 }} keyboardShouldPersistTaps="handled">
        <ErrorBanner message={error} onDismiss={() => setError('')} />
        <VoiceEntryTrigger onPress={voiceEntry.start} count={voiceFields.length} />
        {!isEdit && <Input label="Specialist Name" required value={form.name} onChangeText={set('name')} placeholder="e.g. Dr. Ama Owusu" />}
        <Input label="Professional Pin" required value={form.professional_pin} onChangeText={set('professional_pin')} placeholder="e.g. MDC/PN/XXXXX" />
        <Select label="Specialty" required value={form.specialty} onValueChange={set('specialty')} options={SPECIALTIES} />
        <Input label="Years Experience" value={form.years_experience} onChangeText={set('years_experience')} keyboardType="number-pad" />
        <Input label="Qualification" value={form.qualification} onChangeText={set('qualification')} placeholder="e.g. MBChB, FWACS" />
        <Input label="Phone" value={form.specialist_phone} onChangeText={set('specialist_phone')} placeholder="e.g. 0241234567" keyboardType="phone-pad" />
        <Input label="Email" value={form.specialist_email} onChangeText={set('specialist_email')} placeholder="doctor@email.com" keyboardType="email-address" autoCapitalize="none" />
        <Input label="WhatsApp" value={form.whatsapp_number} onChangeText={set('whatsapp_number')} placeholder="e.g. 0241234567" keyboardType="phone-pad" />
        <Input label="Emergency Contact" value={form.emergency_contact} onChangeText={set('emergency_contact')} placeholder="Alternative contact" keyboardType="phone-pad" />
        <Select
          label="Facility (optional — for display only, does not restrict assignment)" value={form.facility}
          onValueChange={set('facility')} placeholder="— No facility tag —"
          options={facilities.map((f) => ({ value: f.id, label: f.name }))}
        />
        <Input label="Bio" value={form.bio} onChangeText={set('bio')} placeholder="Brief professional bio…" multiline numberOfLines={2} />
        <View style={styles.toggleBox}>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Available for consultations</Text>
            <Switch value={form.is_available} onValueChange={set('is_available')} trackColor={{ true: Colors.primary }} />
          </View>
        </View>
      </ScrollView>
      <View style={styles.modalActions}>
        <Button title="Cancel" variant="outline" onPress={onClose} style={{ flex: 1 }} />
        <Button title={isEdit ? 'Save Changes' : 'Create Profile'} onPress={handleSubmit} loading={saving} style={{ flex: 2 }} />
      </View>
      <VoiceEntryBar voiceEntry={voiceEntry} />
    </Modal>
  );
}

function DeleteSpecialistModal({ visible, specialist, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setDeleting(true); setError('');
    try {
      await consultationsApi.specialists.delete(specialist.id);
      onDeleted(specialist.id);
    } catch (err) {
      setError(getErrorMessage(err));
      setDeleting(false);
    }
  };

  if (!specialist) return null;
  return (
    <Modal visible={visible} onClose={onClose} title="Delete Specialist Profile?">
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <Text style={styles.deleteBody}>
        Are you sure you want to delete <Text style={{ fontWeight: Typography.bold }}>{specialist.user_name || specialist.display_name}</Text>'s
        specialist profile? This can't be undone, and any past consultations will keep showing this name but lose the live profile link.
      </Text>
      <View style={styles.modalActions}>
        <Button title="Cancel" variant="outline" onPress={onClose} style={{ flex: 1 }} />
        <Button title="Delete Profile" variant="danger" icon="trash-outline" onPress={handleDelete} loading={deleting} style={{ flex: 2 }} />
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
  filterChip: { backgroundColor: Colors.white, borderRadius: Radius.md, paddingVertical: 8, paddingHorizontal: 14, ...Shadow.sm },
  filterChipActive: { backgroundColor: Colors.primary },
  filterChipText: { fontSize: Typography.xs, fontWeight: Typography.medium, color: Colors.textSecondary },
  filterChipTextActive: { color: Colors.white },
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], marginBottom: Spacing[3], ...Shadow.sm },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3] },
  cardName: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  cardMeta: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2, textTransform: 'capitalize' },
  cardDetail: { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: Spacing[2] },
  cardActions: { flexDirection: 'row', gap: 6, marginTop: Spacing[3] },
  iconBtn: { width: 28, height: 28, borderRadius: Radius.sm, backgroundColor: Colors.successLight, alignItems: 'center', justifyContent: 'center' },
  iconBtnDanger: { backgroundColor: Colors.dangerLight },
  toggleBox: { backgroundColor: Colors.gray50, borderRadius: Radius.md, paddingHorizontal: Spacing[3], marginTop: Spacing[2] },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing[3] },
  toggleLabel: { fontSize: Typography.sm, color: Colors.textSecondary },
  deleteBody: { fontSize: Typography.sm, color: Colors.textSecondary, marginBottom: Spacing[2] },
  modalActions: { flexDirection: 'row', gap: Spacing[2], marginTop: Spacing[3] },
});
