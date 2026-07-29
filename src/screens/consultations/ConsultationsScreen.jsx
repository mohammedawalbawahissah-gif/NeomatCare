import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { consultationsApi, getErrorMessage } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
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
const STATUS_VARIANT = { pending: 'warning', active: 'info', completed: 'success', cancelled: 'danger' };
const timeAgo = (d) => {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

export default function ConsultationsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isSuperadmin, isFacilityAdmin, user } = useAuth();
  const canManage = isSuperadmin || isFacilityAdmin;

  const [tab, setTab] = useState('consultations'); // 'consultations' | 'specialists'
  const [items, setItems] = useState([]);
  const [specialists, setSpecialists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [specialistModal, setSpecialistModal] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const [{ data: c }, { data: s }] = await Promise.all([consultationsApi.list(), consultationsApi.specialists.list()]);
      setItems(Array.isArray(c) ? c : (c.results || []));
      setSpecialists(Array.isArray(s) ? s : (s.results || []));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const nameFor = (c) => c.specialist_name || 'Unassigned';
  const requesterLabel = (c) => (c.requested_by === user?.id ? 'You' : (c.requested_by_name || '—'));

  const pending = items.filter((c) => c.status === 'pending');
  const active  = items.filter((c) => c.status === 'active');
  const closed  = items.filter((c) => ['completed', 'cancelled'].includes(c.status));

  const renderGroup = (title, group) => group.length > 0 && (
    <View key={title} style={{ marginBottom: Spacing[4] }}>
      <Text style={styles.groupLabel}>{title}</Text>
      <View style={styles.groupCard}>
        {group.map((c) => (
          <TouchableOpacity key={c.id} style={styles.row} onPress={() => navigation.navigate('ConsultationDetail', { id: c.id })}>
            <View style={styles.rowIcon}><Ionicons name="videocam-outline" size={18} color="#7c3aed" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{nameFor(c)}</Text>
              <Text style={styles.rowMeta}>Requested by {requesterLabel(c)} · {timeAgo(c.created_at)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Badge label={c.status} variant={STATUS_VARIANT[c.status]} />
              <Ionicons name="chevron-forward" size={16} color={Colors.gray300} />
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing[16] }]}>
        <View>
          <Text style={styles.headerTitle}>Consultations</Text>
          <Text style={styles.headerSub}>{items.length} consultation{items.length !== 1 ? 's' : ''} · {specialists.length} specialist{specialists.length !== 1 ? 's' : ''}</Text>
        </View>
        {canManage && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setSpecialistModal(true)}>
            <Ionicons name="add" size={22} color={Colors.white} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.tabBar}>
        {[['consultations', `All (${items.length})`], ['specialists', `Specialists (${specialists.length})`]].map(([v, l]) => (
          <TouchableOpacity key={v} onPress={() => setTab(v)} style={[styles.tabBtn, tab === v && styles.tabBtnActive]}>
            <Text style={[styles.tabBtnText, tab === v && styles.tabBtnTextActive]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {loading ? <Spinner fullScreen /> : (
        <ScrollView
          contentContainerStyle={{ padding: Spacing[4] }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        >
          {tab === 'consultations' && (
            items.length === 0 ? (
              <EmptyState icon="videocam-outline" title="No consultations yet" message="Consultations are requested from an emergency case" />
            ) : (
              <>
                {renderGroup('🔔 Pending', pending)}
                {renderGroup('⚡ Active', active)}
                {renderGroup('✅ Closed', closed)}
              </>
            )
          )}

          {tab === 'specialists' && (
            specialists.length === 0 ? (
              <EmptyState
                icon="medkit-outline" title="No specialists registered yet"
                message="Add specialist profiles so health workers can request consultations"
                action={canManage ? { label: 'Add Specialist', onPress: () => setSpecialistModal(true) } : null}
              />
            ) : specialists.map((s) => (
              <View key={s.id} style={styles.specCard}>
                <View style={styles.specHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.specName}>{s.user_name || s.display_name}</Text>
                    <Text style={styles.specSpecialty}>{s.specialty_display || s.specialty?.replace(/_/g, ' ')}</Text>
                  </View>
                  <Badge label={s.is_available ? 'Available' : 'Unavailable'} variant={s.is_available ? 'success' : 'default'} />
                </View>
                {!!s.qualification && <Text style={styles.specDetail}>🎓 {s.qualification}</Text>}
                {s.years_experience > 0 && <Text style={styles.specDetail}>⏱ {s.years_experience} years experience</Text>}
                {!!s.bio && <Text style={styles.specBio}>{s.bio}</Text>}
              </View>
            ))
          )}
        </ScrollView>
      )}

      <AddSpecialistModal
        visible={specialistModal} onClose={() => setSpecialistModal(false)}
        onCreated={(s) => { setSpecialists((prev) => [s, ...prev]); setSpecialistModal(false); }}
      />
    </View>
  );
}

function AddSpecialistModal({ visible, onClose, onCreated }) {
  const INITIAL = {
    name: '', professional_pin: '', specialty: 'obstetrics', qualification: '',
    years_experience: '0', specialist_phone: '', specialist_email: '',
    whatsapp_number: '', emergency_contact: '', bio: '',
  };
  const [form, setForm] = useState(INITIAL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
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
    if (!form.name.trim()) { setError('Specialist name is required.'); return; }
    if (!form.professional_pin.trim()) { setError('Professional pin is required.'); return; }
    setSaving(true); setError('');
    try {
      const { data } = await consultationsApi.specialists.create({
        name: form.name, professional_pin: form.professional_pin, specialty: form.specialty,
        qualification: form.qualification, years_experience: Number(form.years_experience) || 0,
        specialist_phone: form.specialist_phone, specialist_email: form.specialist_email,
        whatsapp_number: form.whatsapp_number, emergency_contact: form.emergency_contact, bio: form.bio,
      });
      onCreated(data);
      setForm(INITIAL);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Add Specialist Profile" size="lg">
      <ScrollView style={{ maxHeight: 480 }} keyboardShouldPersistTaps="handled">
        <ErrorBanner message={error} onDismiss={() => setError('')} />
        <VoiceEntryTrigger onPress={voiceEntry.start} count={voiceFields.length} />
        <Input label="Specialist Name" required value={form.name} onChangeText={set('name')} placeholder="e.g. Dr. Ama Owusu" />
        <Input label="Professional Pin" required value={form.professional_pin} onChangeText={set('professional_pin')} placeholder="e.g. MDC/PN/XXXXX" />
        <Select label="Specialty" required value={form.specialty} onValueChange={set('specialty')} options={SPECIALTIES} />
        <Input label="Years Experience" value={form.years_experience} onChangeText={set('years_experience')} keyboardType="number-pad" />
        <Input label="Qualification" value={form.qualification} onChangeText={set('qualification')} placeholder="e.g. MBChB, FWACS" />
        <Input label="Phone" value={form.specialist_phone} onChangeText={set('specialist_phone')} placeholder="e.g. 0241234567" keyboardType="phone-pad" />
        <Input label="Email" value={form.specialist_email} onChangeText={set('specialist_email')} placeholder="doctor@email.com" keyboardType="email-address" autoCapitalize="none" />
        <Input label="WhatsApp" value={form.whatsapp_number} onChangeText={set('whatsapp_number')} placeholder="e.g. 0241234567" keyboardType="phone-pad" />
        <Input label="Emergency Contact" value={form.emergency_contact} onChangeText={set('emergency_contact')} placeholder="Alternative contact" keyboardType="phone-pad" />
        <Input label="Bio" value={form.bio} onChangeText={set('bio')} placeholder="Brief professional bio…" multiline numberOfLines={2} />
      </ScrollView>
      <View style={styles.modalActions}>
        <Button title="Cancel" variant="outline" onPress={onClose} style={{ flex: 1 }} />
        <Button title="Create Profile" onPress={handleSubmit} loading={saving} style={{ flex: 2 }} />
      </View>
      <VoiceEntryBar voiceEntry={voiceEntry} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing[4], paddingTop: Spacing[5], paddingBottom: Spacing[2] },
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  addBtn: { width: 36, height: 36, borderRadius: Radius.full, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', ...Shadow.sm },
  tabBar: { flexDirection: 'row', gap: 4, backgroundColor: Colors.gray100, borderRadius: Radius.md, padding: 4, marginHorizontal: Spacing[4], marginTop: Spacing[2], alignSelf: 'flex-start' },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.sm },
  tabBtnActive: { backgroundColor: Colors.white, ...Shadow.sm },
  tabBtnText: { fontSize: Typography.xs, fontWeight: Typography.medium, color: Colors.textSecondary },
  tabBtnTextActive: { color: Colors.textPrimary },
  groupLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.gray400, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing[2] },
  groupCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, ...Shadow.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], padding: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  rowIcon: { width: 36, height: 36, borderRadius: Radius.md, backgroundColor: '#f3e8ff', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  rowMeta: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  specCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], marginBottom: Spacing[3], ...Shadow.sm },
  specHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  specName: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  specSpecialty: { fontSize: Typography.xs, color: Colors.gray400, textTransform: 'capitalize', marginTop: 2 },
  specDetail: { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: Spacing[2] },
  specBio: { fontSize: Typography.xs, color: Colors.gray400, fontStyle: 'italic', marginTop: Spacing[2], lineHeight: 18 },
  modalActions: { flexDirection: 'row', gap: Spacing[2], marginTop: Spacing[3] },
});
