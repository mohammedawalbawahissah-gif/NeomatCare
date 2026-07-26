import React, { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getErrorMessage } from '../../api/client';
import { useOfflineQueue } from '../../contexts/OfflineQueueContext';
import { QueueKinds } from '../../utils/offlineQueue';
import { Input, Select, Button, ErrorBanner } from '../../components/ui';
import VoiceEntryBar, { VoiceEntryTrigger } from '../../components/voice/VoiceEntryBar';
import useVoiceEntry from '../../hooks/useVoiceEntry';
import Colors from '../../constants/colors';
import { Typography, Spacing } from '../../constants/theme';

const BLOOD_GROUPS = ['unknown', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
  .map((g) => ({ value: g, label: g === 'unknown' ? 'Unknown' : g }));

export default function PatientCreateScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { submitOrQueue } = useOfflineQueue();
  const [form, setForm] = useState({
    patient_name: '', hospital_id: '', patient_phone_number: '',
    age: '', date_of_birth: '', town: '', blood_group: 'unknown',
    next_of_kin_name: '', next_of_kin_phone: '', next_of_kin_relationship: '',
    expected_delivery_date: '', gravida: '', parity: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  // Every free-text field on this form, in display order. Blood group
  // (dropdown), age/gravida/parity (numeric), and dates are excluded.
  const voiceFields = [
    { key: 'patient_name', label: 'Full Name', get: () => form.patient_name, set: set('patient_name') },
    { key: 'hospital_id', label: 'Hospital / Folder ID', get: () => form.hospital_id, set: set('hospital_id') },
    { key: 'patient_phone_number', label: 'Phone Number', get: () => form.patient_phone_number, set: set('patient_phone_number') },
    { key: 'town', label: 'Town / Community', get: () => form.town, set: set('town') },
    { key: 'next_of_kin_name', label: 'Next of Kin Name', get: () => form.next_of_kin_name, set: set('next_of_kin_name') },
    { key: 'next_of_kin_phone', label: 'Next of Kin Phone', get: () => form.next_of_kin_phone, set: set('next_of_kin_phone') },
    { key: 'next_of_kin_relationship', label: 'Next of Kin Relationship', get: () => form.next_of_kin_relationship, set: set('next_of_kin_relationship') },
    { key: 'notes', label: 'Notes', get: () => form.notes, set: set('notes') },
  ];
  const voiceEntry = useVoiceEntry(voiceFields);

  const handleSave = async () => {
    if (!form.age) { setError('Age is required.'); return; }
    setSaving(true); setError('');
    try {
      const payload = { ...form };
      ['date_of_birth', 'expected_delivery_date', 'gravida', 'parity'].forEach((k) => {
        if (!payload[k]) payload[k] = null;
      });
      if (payload.gravida) payload.gravida = Number(payload.gravida);
      if (payload.parity)  payload.parity  = Number(payload.parity);
      payload.age = Number(payload.age);

      const result = await submitOrQueue({
        method: 'post',
        url: '/api/cases/patients/',
        data: payload,
        meta: { kind: QueueKinds.PATIENT_CREATE, label: payload.patient_name || 'New patient' },
      });

      if (result.queued) {
        // No server id yet — there's no detail screen to open, so go back
        // to the list. The offline banner tells the worker it's saved and
        // will sync; the record itself isn't visible in the list until then.
        navigation.goBack();
      } else {
        navigation.replace('PatientDetail', { id: result.response.data.id });
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing[5] }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Patient Record</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <ErrorBanner message={error} onDismiss={() => setError('')} />
        <VoiceEntryTrigger onPress={voiceEntry.start} count={voiceFields.length} />

        <Text style={styles.sectionLabel}>Identity</Text>
        <Input label="Full Name" value={form.patient_name} onChangeText={set('patient_name')} placeholder="Patient's full name" />
        <Input label="Hospital / Folder ID" value={form.hospital_id} onChangeText={set('hospital_id')} placeholder="e.g. KBU-2024-001" />
        <Input label="Phone Number" value={form.patient_phone_number} onChangeText={set('patient_phone_number')} placeholder="e.g. 024 000 0000" keyboardType="phone-pad" />
        <Input label="Age" required value={form.age} onChangeText={set('age')} placeholder="e.g. 28" keyboardType="number-pad" />
        <Input label="Date of Birth" value={form.date_of_birth} onChangeText={set('date_of_birth')} placeholder="YYYY-MM-DD" />
        <Input label="Town / Community" value={form.town} onChangeText={set('town')} placeholder="e.g. Kumasi" />
        <Select label="Blood Group" value={form.blood_group} onValueChange={set('blood_group')} options={BLOOD_GROUPS} />

        <Text style={styles.sectionLabel}>Obstetric Summary</Text>
        <Input label="Gravida" value={form.gravida} onChangeText={set('gravida')} placeholder="—" keyboardType="number-pad" />
        <Input label="Parity" value={form.parity} onChangeText={set('parity')} placeholder="—" keyboardType="number-pad" />
        <Input label="Expected Delivery" value={form.expected_delivery_date} onChangeText={set('expected_delivery_date')} placeholder="YYYY-MM-DD" />

        <Text style={styles.sectionLabel}>Next of Kin</Text>
        <Input label="Name" value={form.next_of_kin_name} onChangeText={set('next_of_kin_name')} placeholder="Full name" />
        <Input label="Phone" value={form.next_of_kin_phone} onChangeText={set('next_of_kin_phone')} placeholder="Contact number" keyboardType="phone-pad" />
        <Input label="Relationship" value={form.next_of_kin_relationship} onChangeText={set('next_of_kin_relationship')} placeholder="e.g. Husband" />

        <Text style={styles.sectionLabel}>Notes</Text>
        <Input
          value={form.notes} onChangeText={set('notes')}
          placeholder="Background clinical notes, chronic conditions…"
          multiline numberOfLines={3}
        />

        <Button title="Create Patient" onPress={handleSave} loading={saving} fullWidth icon="person-add" style={{ marginTop: Spacing[3] }} />
        <Button title="Cancel" onPress={() => navigation.goBack()} variant="ghost" fullWidth style={{ marginTop: Spacing[2] }} />
      </ScrollView>
      <VoiceEntryBar voiceEntry={voiceEntry} />
    </KeyboardAvoidingView>
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
  headerTitle: { fontSize: Typography.md, fontWeight: Typography.semibold, color: Colors.textPrimary },
  scroll: { padding: Spacing[4], paddingBottom: Spacing[10] },
  sectionLabel: {
    fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.gray400,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: Spacing[3], marginBottom: Spacing[2],
  },
});
