import React, { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getErrorMessage } from '../../api/client';
import { useOfflineQueue } from '../../contexts/OfflineQueueContext';
import { QueueKinds } from '../../utils/offlineQueue';
import { Input, Select, Button, ErrorBanner } from '../../components/ui';
import Colors from '../../constants/colors';
import { Typography, Spacing } from '../../constants/theme';

const FOOD_SECURITY_OPTIONS = [
  { value: 'unknown',  label: 'Unknown' },
  { value: 'secure',   label: 'Secure' },
  { value: 'at_risk',  label: 'At risk' },
  { value: 'insecure', label: 'Insecure' },
];

export default function HouseholdCreateScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { submitOrQueue } = useOfflineQueue();
  const [form, setForm] = useState({ head_name: '', town: '', food_security_flag: 'unknown' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.head_name) { setError('Head of household is required.'); return; }
    setSaving(true); setError('');
    try {
      const result = await submitOrQueue({
        method: 'post',
        url: '/api/cases/households/',
        data: form,
        meta: { kind: QueueKinds.HOUSEHOLD_CREATE, label: form.head_name },
      });

      if (result.queued) {
        navigation.goBack();
      } else {
        navigation.replace('HouseholdDetail', { id: result.response.data.id });
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing[16] }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Household</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <ErrorBanner message={error} onDismiss={() => setError('')} />

        <Input label="Head of Household" required value={form.head_name} onChangeText={set('head_name')} placeholder="e.g. Amina's Compound" />
        <Input label="Town / Community" value={form.town} onChangeText={set('town')} placeholder="e.g. Tamale" />
        <Select label="Food Security Status" value={form.food_security_flag} onValueChange={set('food_security_flag')} options={FOOD_SECURITY_OPTIONS} />
        <Text style={styles.hint}>Used to scope nutrition guidance for this household's children.</Text>

        <Button title="Create Household" onPress={handleSave} loading={saving} fullWidth icon="home" style={{ marginTop: Spacing[3] }} />
        <Button title="Cancel" onPress={() => navigation.goBack()} variant="ghost" fullWidth style={{ marginTop: Spacing[2] }} />
      </ScrollView>
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
  hint: { fontSize: Typography.xs, color: Colors.gray400, marginTop: -Spacing[2], marginBottom: Spacing[3] },
});
