import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { referralsApi, getErrorMessage } from '../../api/client';
import { Input, Select, Button, Modal, Spinner, Badge, ErrorBanner, Card } from '../../components/ui';
import ReadAloudTrigger from '../../components/voice/ReadAloudBar';
import useReadAloud from '../../hooks/useReadAloud';
import VoiceEntryBar, { VoiceEntryTrigger } from '../../components/voice/VoiceEntryBar';
import useVoiceEntry from '../../hooks/useVoiceEntry';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius } from '../../constants/theme';
import HandoverBriefPanel from '../../components/ai/HandoverBriefPanel';

const STATUS_VARIANT = {
  DRAFT: 'default', PENDING: 'warning', ACCEPTED: 'info', IN_TRANSIT: 'info',
  RECEIVED: 'success', COMPLETED: 'success', CANCELLED: 'danger', FAILED: 'danger',
};
const STATUS_LABELS = {
  PENDING: 'Mark Pending', ACCEPTED: 'Accept', IN_TRANSIT: 'Mark In Transit',
  RECEIVED: 'Mark Received', COMPLETED: 'Complete', CANCELLED: 'Cancel', FAILED: 'Mark Failed',
};
const OUTCOME_COLOR = { survived: Colors.successDark, died: Colors.dangerDark, unknown: Colors.gray400 };
const fmt = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const timeAgo = (d) => {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

export default function ReferralDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const [r, setR]           = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [statusModal, setStatusModal]   = useState(false);
  const [outcomeModal, setOutcomeModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await referralsApi.detail(id);
      setR(data);
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Hook must run unconditionally on every render, so it's declared before
  // the loading/error early-returns below, using a safe fallback.
  const rSafe = r || {};
  const [handoverSpeakable, setHandoverSpeakable] = useState(null);
  const readAloudItems = [
    { label: 'Route', text: `From ${rSafe.referring_facility_name || 'unknown'} to ${rSafe.receiving_facility_name || 'unknown'}` },
    ...(rSafe.override_reason ? [{ label: 'Override reason', text: rSafe.override_reason }] : []),
    ...((rSafe.maternal_outcome && rSafe.maternal_outcome !== 'unknown') || (rSafe.neonatal_outcome && rSafe.neonatal_outcome !== 'unknown') ? [{ label: 'Outcomes', text: `Maternal: ${rSafe.maternal_outcome}, Neonatal: ${rSafe.neonatal_outcome}` }] : []),
    ...(rSafe.outcome_notes ? [{ label: 'Outcome notes', text: rSafe.outcome_notes }] : []),
    ...(handoverSpeakable ? [{ label: 'AI handover brief', text: handoverSpeakable }] : []),
  ];
  const readAloud = useReadAloud(readAloudItems);

  if (loading) return <Spinner fullScreen />;
  if (error || !r) {
    return (
      <View style={styles.container}>
        <Header navigation={navigation} />
        <ErrorBanner message={error || 'Referral not found.'} />
      </View>
    );
  }

  const canUpdateStatus  = (r.valid_next_statuses || []).length > 0;
  const canRecordOutcome = ['RECEIVED', 'COMPLETED'].includes(r.status);

  return (
    <View style={styles.container}>
      <Header navigation={navigation} status={r.status} />
      <ScrollView contentContainerStyle={{ padding: Spacing[4], paddingBottom: Spacing[10], gap: Spacing[3] }}>
        <Text style={styles.idText}>{r.id}</Text>
        <ReadAloudTrigger readAloud={readAloud} />

        <HandoverBriefPanel referralId={r.id} onSpeakableText={setHandoverSpeakable} />

        <Card>
          <Text style={styles.cardLabel}>Referral Route</Text>
          <View style={styles.routeRow}>
            <View style={styles.routeBox}>
              <Text style={styles.routeSub}>From</Text>
              <Text style={styles.routeName} numberOfLines={2}>{r.referring_facility_name}</Text>
            </View>
            <Ionicons name="swap-horizontal" size={18} color={Colors.gray300} />
            <View style={[styles.routeBox, styles.routeBoxTo]}>
              <Text style={styles.routeSub}>To</Text>
              <Text style={styles.routeName} numberOfLines={2}>{r.receiving_facility_name}</Text>
            </View>
          </View>
          {!!r.engine_recommendation_name && (
            <Text style={styles.engineText}>
              Engine recommended: <Text style={styles.engineHighlight}>{r.engine_recommendation_name}</Text>
              {!!r.override_reason && <Text> · Override: "{r.override_reason}"</Text>}
            </Text>
          )}
        </Card>

        <Card>
          <Text style={styles.cardLabel}>Timeline</Text>
          {(r.timeline || []).length === 0 ? (
            <Text style={styles.emptyText}>No timeline entries yet.</Text>
          ) : r.timeline.map((t) => (
            <View key={t.id} style={styles.timelineRow}>
              <View style={styles.timelineDot}><Ionicons name="checkmark" size={10} color={Colors.primaryDark} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.timelineText}>{t.from_status ? `${t.from_status} → ${t.to_status}` : t.to_status}</Text>
                {!!t.note && <Text style={styles.timelineNote}>{t.note}</Text>}
                <Text style={styles.timelineMeta}>{t.changed_by_name} · {fmt(t.timestamp)}</Text>
              </View>
            </View>
          ))}
        </Card>

        {(r.maternal_outcome !== 'unknown' || r.neonatal_outcome !== 'unknown') && (
          <Card>
            <Text style={styles.cardLabel}>Outcomes</Text>
            <View style={styles.outcomeGrid}>
              <View style={styles.outcomeBox}>
                <Text style={styles.routeSub}>Maternal</Text>
                <Text style={[styles.outcomeVal, { color: OUTCOME_COLOR[r.maternal_outcome] }]}>{r.maternal_outcome}</Text>
              </View>
              <View style={styles.outcomeBox}>
                <Text style={styles.routeSub}>Neonatal</Text>
                <Text style={[styles.outcomeVal, { color: OUTCOME_COLOR[r.neonatal_outcome] }]}>{r.neonatal_outcome}</Text>
              </View>
            </View>
            {!!r.outcome_notes && <Text style={styles.notesTextSm}>{r.outcome_notes}</Text>}
          </Card>
        )}

        <Card>
          <View style={styles.kvRow}><Text style={styles.kvKey}>Created by</Text><Text style={styles.kvVal}>{r.created_by_name}</Text></View>
          <View style={styles.kvRow}><Text style={styles.kvKey}>Created</Text><Text style={styles.kvVal}>{fmt(r.created_at)}</Text></View>
          <View style={styles.kvRow}><Text style={styles.kvKey}>Updated</Text><Text style={styles.kvVal}>{timeAgo(r.updated_at)}</Text></View>
          {!!r.emergency_case_id && (
            <TouchableOpacity style={styles.viewCaseLink} onPress={() => navigation.navigate('CaseDetail', { id: r.emergency_case_id })}>
              <Text style={styles.viewCaseLinkText}>View Case</Text>
              <Ionicons name="arrow-forward" size={14} color={Colors.primaryDark} />
            </TouchableOpacity>
          )}
        </Card>

        {(canUpdateStatus || canRecordOutcome) && (
          <View style={{ gap: Spacing[2] }}>
            {canUpdateStatus && <Button title="Update Status" icon="refresh" onPress={() => setStatusModal(true)} fullWidth />}
            {canRecordOutcome && <Button title="Record Outcome" variant="outline" icon="document-text-outline" onPress={() => setOutcomeModal(true)} fullWidth />}
          </View>
        )}
      </ScrollView>

      <StatusUpdateModal visible={statusModal} onClose={() => setStatusModal(false)} referral={r} onUpdated={(updated) => { setR(updated); setStatusModal(false); }} />
      <OutcomeModal visible={outcomeModal} onClose={() => setOutcomeModal(false)} referral={r} onUpdated={(updated) => { setR(updated); setOutcomeModal(false); }} />
    </View>
  );
}

function Header({ navigation, status }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + Spacing[5] }]}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Referral</Text>
      {status ? <Badge label={status.replace(/_/g, ' ')} variant={STATUS_VARIANT[status]} /> : <View style={{ width: 36 }} />}
    </View>
  );
}

function StatusUpdateModal({ visible, onClose, referral, onUpdated }) {
  const validNext = referral?.valid_next_statuses || [];
  const [newStatus, setNewStatus] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const voiceFields = [{ key: 'note', label: 'Note', get: () => note, set: setNote }];
  const voiceEntry = useVoiceEntry(voiceFields);

  React.useEffect(() => { if (visible) { setNewStatus(''); setNote(''); setError(''); } }, [visible]);

  const handleSubmit = async () => {
    if (!newStatus) return;
    setSaving(true); setError('');
    try {
      const { data } = await referralsApi.updateStatus(referral.id, newStatus, note);
      onUpdated(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Update Referral Status">
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <Select label="New Status" required value={newStatus} onValueChange={setNewStatus}
        placeholder="— Select —" options={validNext.map((s) => ({ value: s, label: STATUS_LABELS[s] || s }))} />
      <VoiceEntryTrigger onPress={voiceEntry.start} count={voiceFields.length} />
      <Input label="Note (optional)" value={note} onChangeText={setNote} multiline numberOfLines={2} placeholder="Optional note about this transition…" />
      <View style={styles.modalActions}>
        <Button title="Cancel" variant="outline" onPress={onClose} style={{ flex: 1 }} />
        <Button title="Update" onPress={handleSubmit} loading={saving} disabled={!newStatus} style={{ flex: 1 }} />
      </View>
      <VoiceEntryBar voiceEntry={voiceEntry} />
    </Modal>
  );
}

function OutcomeModal({ visible, onClose, referral, onUpdated }) {
  const [form, setForm] = useState({ maternal_outcome: 'unknown', neonatal_outcome: 'unknown', outcome_notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const voiceFields = [{ key: 'outcome_notes', label: 'Outcome Notes', get: () => form.outcome_notes, set: (v) => setForm((f) => ({ ...f, outcome_notes: v })) }];
  const voiceEntry = useVoiceEntry(voiceFields);

  const OUTCOME_OPTS = [{ value: 'unknown', label: 'Unknown' }, { value: 'survived', label: 'Survived' }, { value: 'died', label: 'Died' }];

  const handleSubmit = async () => {
    setSaving(true); setError('');
    try {
      const { data } = await referralsApi.outcome(referral.id, form);
      onUpdated(data);
    } catch {
      setError('Failed to save outcome.');
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Record Outcome">
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <Select label="Maternal Outcome" required value={form.maternal_outcome} onValueChange={(v) => setForm((f) => ({ ...f, maternal_outcome: v }))} options={OUTCOME_OPTS} />
      <Select label="Neonatal Outcome" required value={form.neonatal_outcome} onValueChange={(v) => setForm((f) => ({ ...f, neonatal_outcome: v }))} options={OUTCOME_OPTS} />
      <VoiceEntryTrigger onPress={voiceEntry.start} count={voiceFields.length} />
      <Input label="Outcome Notes" value={form.outcome_notes} onChangeText={(v) => setForm((f) => ({ ...f, outcome_notes: v }))} multiline numberOfLines={2} placeholder="Additional notes…" />
      <View style={styles.modalActions}>
        <Button title="Cancel" variant="outline" onPress={onClose} style={{ flex: 1 }} />
        <Button title="Save Outcome" onPress={handleSubmit} loading={saving} style={{ flex: 1 }} />
      </View>
      <VoiceEntryBar voiceEntry={voiceEntry} />
    </Modal>
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
  idText: { fontSize: 10, color: Colors.gray400, fontFamily: 'monospace' },
  cardLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.gray400, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing[3] },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  routeBox: { flex: 1, backgroundColor: Colors.gray50, borderRadius: Radius.md, padding: Spacing[3], alignItems: 'center' },
  routeBoxTo: { backgroundColor: Colors.primaryLight },
  routeSub: { fontSize: Typography.xs, color: Colors.gray400 },
  routeName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary, textAlign: 'center', marginTop: 2 },
  engineText: { fontSize: Typography.xs, color: Colors.gray400, marginTop: Spacing[3], textAlign: 'center' },
  engineHighlight: { color: Colors.primaryDark, fontWeight: Typography.medium },
  emptyText: { fontSize: Typography.sm, color: Colors.gray400, textAlign: 'center', paddingVertical: Spacing[3] },
  timelineRow: { flexDirection: 'row', gap: Spacing[3], paddingVertical: Spacing[2] },
  timelineDot: { width: 22, height: 22, borderRadius: Radius.full, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  timelineText: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  timelineNote: { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: 2 },
  timelineMeta: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  outcomeGrid: { flexDirection: 'row', gap: Spacing[2] },
  outcomeBox: { flex: 1, backgroundColor: Colors.gray50, borderRadius: Radius.md, padding: Spacing[3], alignItems: 'center' },
  outcomeVal: { fontSize: Typography.sm, fontWeight: Typography.bold, marginTop: 2, textTransform: 'capitalize' },
  notesTextSm: { fontSize: Typography.xs, color: Colors.gray400, marginTop: Spacing[2] },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  kvKey: { fontSize: Typography.xs, color: Colors.gray400 },
  kvVal: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  viewCaseLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: Spacing[3] },
  viewCaseLinkText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.primaryDark },
  modalActions: { flexDirection: 'row', gap: Spacing[2], marginTop: Spacing[3] },
});
