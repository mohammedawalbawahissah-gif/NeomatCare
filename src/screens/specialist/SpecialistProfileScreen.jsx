import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { consultationsApi, getErrorMessage } from '../../api/client';
import { Input, Select, Button, Spinner, Badge, ErrorBanner, EmptyState } from '../../components/ui';
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

// This screen only exists for a user with role='specialist'. The
// SpecialistProfile record it edits, however, is a separate model an admin
// creates/links (see consultations.SpecialistProfileViewSet.me) -- so a
// brand-new specialist account can legitimately have no linked profile yet.
// We surface that as an explicit empty state rather than a blank form.
export default function SpecialistProfileScreen() {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState(null);
  const [notLinked, setNotLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState(null);

  const load = useCallback(() => {
    setLoading(true); setError(''); setNotLinked(false);
    consultationsApi.specialists.me()
      .then(({ data }) => {
        setProfile(data);
        setForm({
          specialty: data.specialty, qualification: data.qualification || '',
          years_experience: String(data.years_experience ?? 0),
          specialist_phone: data.specialist_phone || '', specialist_email: data.specialist_email || '',
          whatsapp_number: data.whatsapp_number || '', emergency_contact: data.emergency_contact || '',
          bio: data.bio || '', is_available: !!data.is_available,
        });
      })
      .catch((err) => {
        if (err?.response?.status === 404) setNotLinked(true);
        else setError(getErrorMessage(err));
      })
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };

  const voiceFields = form ? [
    { key: 'qualification', label: 'Qualification', get: () => form.qualification, set: set('qualification') },
    { key: 'specialist_phone', label: 'Phone', get: () => form.specialist_phone, set: set('specialist_phone') },
    { key: 'whatsapp_number', label: 'WhatsApp', get: () => form.whatsapp_number, set: set('whatsapp_number') },
    { key: 'emergency_contact', label: 'Emergency Contact', get: () => form.emergency_contact, set: set('emergency_contact') },
    { key: 'bio', label: 'Bio', get: () => form.bio, set: set('bio') },
  ] : [];
  const voiceEntry = useVoiceEntry(voiceFields);

  const handleSave = async () => {
    setSaving(true); setError(''); setSaved(false);
    try {
      const { data } = await consultationsApi.specialists.updateMe({
        specialty: form.specialty, qualification: form.qualification,
        years_experience: Number(form.years_experience) || 0,
        specialist_phone: form.specialist_phone, specialist_email: form.specialist_email,
        whatsapp_number: form.whatsapp_number, emergency_contact: form.emergency_contact,
        bio: form.bio, is_available: form.is_available,
      });
      setProfile(data);
      setSaved(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally { setSaving(false); }
  };

  if (loading) return <Spinner fullScreen />;

  if (notLinked) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing[16] }]}>
          <Text style={styles.headerTitle}>My Specialist Profile</Text>
        </View>
        <EmptyState
          icon="medkit-outline" title="No profile linked yet"
          message="Your account isn't linked to a specialist profile. Ask your facility admin or a superadmin to link one to your name."
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing[16] }]}>
        <View>
          <Text style={styles.headerTitle}>{profile?.user_name || 'My Specialist Profile'}</Text>
          <Text style={styles.headerSub}>{profile?.professional_pin}</Text>
        </View>
        <Badge label={form.is_available ? 'Available' : 'Unavailable'} variant={form.is_available ? 'success' : 'default'} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing[4] }} keyboardShouldPersistTaps="handled">
        <ErrorBanner message={error} onDismiss={() => setError('')} />
        {saved && (
          <View style={styles.savedBanner}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.successDark} />
            <Text style={styles.savedBannerText}>Profile updated</Text>
          </View>
        )}

        <View style={styles.availabilityRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.availabilityLabel}>Available for consultations</Text>
            <Text style={styles.availabilityHint}>Turn this off when you can't take calls — you'll drop out of the specialist list until you turn it back on.</Text>
          </View>
          <Switch value={form.is_available} onValueChange={set('is_available')} trackColor={{ true: Colors.primary }} />
        </View>

        <VoiceEntryTrigger onPress={voiceEntry.start} count={voiceFields.length} />

        <Select label="Specialty" required value={form.specialty} onValueChange={set('specialty')} options={SPECIALTIES} />
        <Input label="Qualification" value={form.qualification} onChangeText={set('qualification')} placeholder="e.g. MBChB, FWACS" />
        <Input label="Years Experience" value={form.years_experience} onChangeText={set('years_experience')} keyboardType="number-pad" />
        <Input label="Phone" value={form.specialist_phone} onChangeText={set('specialist_phone')} placeholder="e.g. 0241234567" keyboardType="phone-pad" />
        <Input label="Email" value={form.specialist_email} onChangeText={set('specialist_email')} placeholder="doctor@email.com" keyboardType="email-address" autoCapitalize="none" />
        <Input label="WhatsApp" value={form.whatsapp_number} onChangeText={set('whatsapp_number')} placeholder="e.g. 0241234567" keyboardType="phone-pad" />
        <Input label="Emergency Contact" value={form.emergency_contact} onChangeText={set('emergency_contact')} placeholder="Alternative contact" keyboardType="phone-pad" />
        <Input label="Bio" value={form.bio} onChangeText={set('bio')} placeholder="Brief professional bio…" multiline numberOfLines={3} />

        <Button title="Save Changes" onPress={handleSave} loading={saving} style={{ marginTop: Spacing[3] }} />
      </ScrollView>
      <VoiceEntryBar voiceEntry={voiceEntry} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing[4], paddingTop: Spacing[5], paddingBottom: Spacing[3] },
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  savedBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.successLight, borderRadius: Radius.md, padding: Spacing[3], marginBottom: Spacing[3] },
  savedBannerText: { fontSize: Typography.xs, color: Colors.successDark, fontWeight: Typography.medium },
  availabilityRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], marginBottom: Spacing[3], ...Shadow.sm },
  availabilityLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  availabilityHint: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 3, lineHeight: 16 },
});
