import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  casesApi, referralsApi, facilitiesApi, transportApi, consultationsApi, getErrorMessage,
} from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useOfflineQueue } from '../../contexts/OfflineQueueContext';
import { QueueKinds, isQueueItemFailed } from '../../utils/offlineQueue';
import { cachedFetch } from '../../utils/cachedFetch';
import {
  Input, Select, Button, Modal, Spinner, Badge, ErrorBanner, Card,
} from '../../components/ui';
import { DangerSignPicker, DangerSignList } from '../../components/ui/dangerSigns';
import TriageAIPanel from '../../components/ai/TriageAIPanel';
import HandoverBriefPanel from '../../components/ai/HandoverBriefPanel';
import TransportRecommendPanel from '../../components/ai/TransportRecommendPanel';
import ReadAloudTrigger from '../../components/voice/ReadAloudBar';
import useReadAloud from '../../hooks/useReadAloud';
import VoiceEntryBar, { VoiceEntryTrigger } from '../../components/voice/VoiceEntryBar';
import useVoiceEntry from '../../hooks/useVoiceEntry';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

const VALID_TRANSITIONS = {
  DRAFT: ['PENDING', 'CANCELLED'],
  PENDING: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['RECEIVED', 'FAILED'],
  RECEIVED: ['COMPLETED'],
  COMPLETED: [], CANCELLED: [], FAILED: [],
};
const STATUS_VARIANT = {
  DRAFT: 'default', PENDING: 'warning', ACCEPTED: 'info', IN_TRANSIT: 'info',
  RECEIVED: 'success', COMPLETED: 'success', CANCELLED: 'danger', FAILED: 'danger',
};
const OUTCOME_COLOR = { survived: Colors.successDark, died: Colors.dangerDark, unknown: Colors.gray400 };
const VITAL_LABELS = {
  systolic_bp: 'Systolic BP', diastolic_bp: 'Diastolic BP', heart_rate: 'Heart Rate',
  respiratory_rate: 'Resp. Rate', temperature: 'Temp', spo2: 'SpO2',
};
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export default function CaseDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const { isHealthWorker, isFacilityAdmin, isSuperadmin } = useAuth();
  const canManage = isHealthWorker || isFacilityAdmin || isSuperadmin;

  const [c, setCase]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [editModal, setEditModal] = useState(false);
  const [noteText, setNoteText]   = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [referModal, setReferModal] = useState(false);
  const [transportModal, setTransportModal] = useState(false);
  const [consultModal, setConsultModal] = useState(false);
  const [referralRefreshKey, setReferralRefreshKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const { data } = await casesApi.detail(id);
      setCase(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      await casesApi.triageNote(id, noteText.trim());
      setNoteText('');
      load();
    } catch { /* keep the note text so the user can retry */ }
    finally { setAddingNote(false); }
  };

  // Hooks must run unconditionally on every render, so all of this is
  // computed before the loading/error early-returns below, using a safe
  // fallback for the case data.
  const cSafe = c || {};
  const vitals = Object.entries(cSafe.vital_signs || {}).filter(([, v]) => v !== null && v !== '');
  const [triageSpeakable, setTriageSpeakable] = useState(null);
  const [handoverSpeakable, setHandoverSpeakable] = useState(null);

  // Clinically load-bearing content, top-to-bottom as displayed. Labels are
  // spoken, decorative chrome (icons, badges, empty/unknown fields) is not.
  // AI panel output (Triage Analysis, Handover Brief) is appended once
  // generated, reported up via each panel's onSpeakableText prop.
  const readAloudItems = [
    { label: 'Patient', text: `${cSafe.patient?.patient_name || 'Unnamed patient'}, age ${cSafe.patient?.age || 'unknown'}, ${cSafe.patient?.town || 'location unknown'}` },
    ...(cSafe.gestational_age_weeks ? [{ label: 'Gestational age', text: `${cSafe.gestational_age_weeks} weeks` }] : []),
    ...(cSafe.presenting_complaint ? [{ label: 'Presenting complaint', text: cSafe.presenting_complaint }] : []),
    ...((cSafe.danger_signs || []).length ? [{ label: 'Danger signs', text: cSafe.danger_signs.join(', ').replace(/_/g, ' ') }] : []),
    ...(vitals.length ? [{ label: 'Vital signs', text: vitals.map(([k, v]) => `${VITAL_LABELS[k] || k}: ${v}`).join(', ') }] : []),
    ...(cSafe.fetal_heart_rate ? [{ label: 'Fetal heart rate', text: `${cSafe.fetal_heart_rate}` }] : []),
    ...(cSafe.obstetric_history ? [{ label: 'Obstetric history', text: cSafe.obstetric_history }] : []),
    ...(cSafe.outcome_notes ? [{ label: 'Outcome notes', text: cSafe.outcome_notes }] : []),
    ...(triageSpeakable ? [{ label: 'AI triage analysis', text: triageSpeakable }] : []),
    ...(handoverSpeakable ? [{ label: 'AI handover brief', text: handoverSpeakable }] : []),
  ];
  const readAloud = useReadAloud(readAloudItems);

  if (loading) return <Spinner fullScreen />;
  if (error || !c) {
    return (
      <View style={styles.container}>
        <Header navigation={navigation} title="Case" />
        <ErrorBanner message={error || 'Case not found.'} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header navigation={navigation} title={c.patient?.patient_name || 'Emergency Case'} onEdit={canManage ? () => setEditModal(true) : null} />

      <ScrollView contentContainerStyle={{ padding: Spacing[4], paddingBottom: Spacing[10], gap: Spacing[3] }}>
        <ReadAloudTrigger readAloud={readAloud} />

        {canManage && (
          <View style={styles.actionRow}>
            <ActionBtn icon="swap-horizontal" label="Refer" onPress={() => setReferModal(true)} />
            <ActionBtn icon="car-outline" label="Transport" onPress={() => setTransportModal(true)} />
            <ActionBtn icon="videocam-outline" label="Consult" onPress={() => setConsultModal(true)} />
          </View>
        )}

        <Card>
          <Text style={styles.cardLabel}>Patient</Text>
          <Text style={styles.patientName}>{c.patient?.patient_name || 'Unnamed patient'}</Text>
          <Text style={styles.kvKey}>ID: {c.patient?.hospital_id || '—'} · Age {c.patient?.age} · {c.patient?.town || '—'}</Text>
          <View style={styles.kvRow}><Text style={styles.kvKey}>Blood Group</Text><Text style={styles.kvVal}>{c.patient?.blood_group || '—'}</Text></View>
          <View style={styles.kvRow}><Text style={styles.kvKey}>ANC Visits</Text><Text style={styles.kvVal}>{c.patient?.anc_visits ?? '—'}</Text></View>
          <View style={styles.kvRow}><Text style={styles.kvKey}>Gestational Age</Text><Text style={styles.kvVal}>{c.gestational_age_weeks ? `${c.gestational_age_weeks} wks` : '—'}</Text></View>
          <View style={styles.kvRow}><Text style={styles.kvKey}>Gravida / Parity</Text><Text style={styles.kvVal}>{c.gravida ?? '—'} / {c.parity ?? '—'}</Text></View>
        </Card>

        <Card>
          <Text style={styles.cardLabel}>Presenting Complaint</Text>
          <Text style={styles.notesText}>{c.presenting_complaint}</Text>
        </Card>

        <Card>
          <Text style={styles.cardLabel}>Danger Signs</Text>
          <DangerSignList signs={c.danger_signs} />
        </Card>

        {vitals.length > 0 && (
          <Card>
            <Text style={styles.cardLabel}>Vital Signs</Text>
            <View style={styles.vitalsGrid}>
              {vitals.map(([k, v]) => (
                <View key={k} style={styles.vitalBox}>
                  <Text style={styles.vitalVal}>{v}</Text>
                  <Text style={styles.vitalLabel}>{VITAL_LABELS[k] || k}</Text>
                </View>
              ))}
              {!!c.fetal_heart_rate && (
                <View style={styles.vitalBox}><Text style={styles.vitalVal}>{c.fetal_heart_rate}</Text><Text style={styles.vitalLabel}>Fetal HR</Text></View>
              )}
            </View>
          </Card>
        )}

        <Card>
          <View style={styles.kvRow}><Text style={styles.kvKey}>Membranes</Text><Text style={styles.kvVal}>{c.membranes_status}</Text></View>
          <View style={styles.kvRow}><Text style={styles.kvKey}>Referring Facility</Text><Text style={styles.kvVal}>{c.referring_facility_name}</Text></View>
          <View style={styles.kvRow}><Text style={styles.kvKey}>Created by</Text><Text style={styles.kvVal}>{c.created_by_name}</Text></View>
          <View style={styles.kvRow}><Text style={styles.kvKey}>Created</Text><Text style={styles.kvVal}>{fmtDateTime(c.created_at)}</Text></View>
          {!!c.obstetric_history && (
            <>
              <Text style={[styles.cardLabel, { marginTop: Spacing[3] }]}>Obstetric History</Text>
              <Text style={styles.notesText}>{c.obstetric_history}</Text>
            </>
          )}
        </Card>

        {(c.maternal_outcome !== 'unknown' || c.neonatal_outcome !== 'unknown') && (
          <Card>
            <Text style={styles.cardLabel}>Case Outcome</Text>
            <View style={styles.kvRow}><Text style={styles.kvKey}>Maternal</Text><Text style={[styles.kvVal, { color: OUTCOME_COLOR[c.maternal_outcome] }]}>{c.maternal_outcome}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvKey}>Neonatal</Text><Text style={[styles.kvVal, { color: OUTCOME_COLOR[c.neonatal_outcome] }]}>{c.neonatal_outcome}</Text></View>
            {!!c.outcome_notes && <Text style={styles.notesTextSm}>{c.outcome_notes}</Text>}
          </Card>
        )}

        <ReferralSection caseId={id} canManage={canManage} refreshKey={referralRefreshKey} />

        <Card>
          <Text style={styles.cardLabel}>Triage Notes</Text>
          {(c.triage_notes || []).length === 0 ? (
            <Text style={styles.emptyText}>No triage notes yet.</Text>
          ) : c.triage_notes.map((n) => (
            <View key={n.id} style={styles.noteRow}>
              <Text style={styles.noteText}>{n.note}</Text>
              <Text style={styles.noteMeta}>{n.created_by_name} · {fmtDateTime(n.created_at)}</Text>
            </View>
          ))}
          {canManage && (
            <View style={{ marginTop: Spacing[3], gap: Spacing[2] }}>
              {noteText.trim().length > 20 && (
                <TriageAIPanel
                  note={noteText}
                  caseId={id}
                  onSpeakableText={setTriageSpeakable}
                  onApply={({ danger_signs, presenting_complaint_suggestion }) => {
                    setEditModal(true);
                    // EditCaseModal seeds its own state from `c` on open; the
                    // AI's suggested fields are shown in the panel above for
                    // the user to copy in manually via the edit form.
                  }}
                />
              )}
              <Input value={noteText} onChangeText={setNoteText} placeholder="Add a triage note…" multiline numberOfLines={2} />
              <Button title="Add Note" size="sm" onPress={handleAddNote} loading={addingNote} disabled={!noteText.trim()} />
            </View>
          )}
        </Card>

        {canManage && <HandoverBriefPanel caseId={id} onSpeakableText={setHandoverSpeakable} />}
      </ScrollView>

      <EditCaseModal visible={editModal} onClose={() => setEditModal(false)} caseData={c} onSaved={() => { setEditModal(false); load(); }} />
      <ReferralCreateModal visible={referModal} onClose={() => setReferModal(false)} caseData={c} onSaved={() => { setReferModal(false); setReferralRefreshKey((k) => k + 1); }} />
      <TransportRequestModal visible={transportModal} onClose={() => setTransportModal(false)} onSaved={() => setTransportModal(false)} caseId={id} />
      <ConsultationRequestModal visible={consultModal} onClose={() => setConsultModal(false)} onSaved={() => setConsultModal(false)} />
    </View>
  );
}

function Header({ navigation, title, onEdit }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + Spacing[5] }]}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
      {onEdit ? (
        <TouchableOpacity onPress={onEdit} style={styles.backBtn}><Ionicons name="create-outline" size={20} color={Colors.primary} /></TouchableOpacity>
      ) : <View style={{ width: 36 }} />}
    </View>
  );
}

function ActionBtn({ icon, label, onPress }) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress}>
      <Ionicons name={icon} size={18} color={Colors.primary} />
      <Text style={styles.actionBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Referral section — resolves the case's referral via list+detail lookup ──
// (ReferralListSerializer doesn't expose emergency_case_id, only
// ReferralDetailSerializer does, so we fetch details for candidates.)
function ReferralSection({ caseId, canManage, refreshKey }) {
  const [referral, setReferral] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [statusModal, setStatusModal] = useState(false);
  const { pending } = useOfflineQueue();

  const queuedReferral = pending.find(
    (item) => item.meta?.kind === QueueKinds.REFERRAL_CREATE && item.meta?.caseId === caseId
  );

  const fetchReferral = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await referralsApi.list();
      const list = Array.isArray(data) ? data : (data.results || []);
      for (const r of list) {
        const { data: detail } = await referralsApi.detail(r.id);
        if (detail.emergency_case_id === caseId) { setReferral(detail); setLoading(false); return; }
      }
      setReferral(null);
    } catch { setReferral(null); }
    finally { setLoading(false); }
  }, [caseId]);

  useFocusEffect(useCallback(() => { fetchReferral(); }, [fetchReferral]));
  React.useEffect(() => { if (refreshKey) fetchReferral(); }, [refreshKey]);

  if (loading) return <Card><Text style={styles.emptyText}>Loading referral…</Text></Card>;

  if (!referral) {
    if (queuedReferral) {
      const failed = isQueueItemFailed(queuedReferral);
      return (
        <Card style={{ borderWidth: 1, borderColor: failed ? Colors.dangerLight : Colors.warningLight, borderStyle: 'dashed' }}>
          <View style={styles.refHeaderRow}>
            <Text style={styles.cardLabel}>Referral</Text>
            <Badge label={failed ? 'Sync failed' : 'Pending sync'} variant={failed ? 'danger' : 'warning'} />
          </View>
          <Text style={styles.emptyText}>
            {failed
              ? `Saved on this device but couldn't reach the server: ${queuedReferral.lastError || 'unknown error'}. Check the sync icon to retry or discard.`
              : `${queuedReferral.meta?.label || 'Referral'} is saved on this device and will be sent once back online. Transport can be assigned after it syncs.`}
          </Text>
        </Card>
      );
    }
    return (
      <Card>
        <Text style={styles.cardLabel}>Referral</Text>
        <Text style={styles.emptyText}>No referral created yet. Use the Refer action above.</Text>
      </Card>
    );
  }

  const validNext = VALID_TRANSITIONS[referral.status] || [];
  const isTerminal = validNext.length === 0;

  return (
    <>
      <Card>
        <View style={styles.refHeaderRow}>
          <Text style={styles.cardLabel}>Referral</Text>
          <Badge label={referral.status.replace(/_/g, ' ')} variant={STATUS_VARIANT[referral.status]} />
        </View>
        <View style={styles.refRoute}>
          <Text style={styles.refFacility} numberOfLines={1}>{referral.referring_facility_name}</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.gray400} />
          <Text style={styles.refFacility} numberOfLines={1}>{referral.receiving_facility_name}</Text>
        </View>
        {(referral.maternal_outcome !== 'unknown' || referral.neonatal_outcome !== 'unknown') && (
          <View style={styles.refOutcomeRow}>
            <Text style={styles.kvKey}>Maternal: <Text style={styles.kvVal}>{referral.maternal_outcome}</Text></Text>
            <Text style={styles.kvKey}>Neonatal: <Text style={styles.kvVal}>{referral.neonatal_outcome}</Text></Text>
          </View>
        )}
        {canManage && !isTerminal && (
          <Button title="Update Status" size="sm" variant="outline" icon="refresh" onPress={() => setStatusModal(true)} fullWidth style={{ marginTop: Spacing[2] }} />
        )}
        {isTerminal && <Text style={styles.emptyText}>Referral is {referral.status.toLowerCase()} — no further actions.</Text>}
      </Card>
      <StatusUpdateModal
        visible={statusModal} onClose={() => setStatusModal(false)} referral={referral}
        onUpdated={(r) => { setReferral(r); setStatusModal(false); }}
      />
    </>
  );
}

function StatusUpdateModal({ visible, onClose, referral, onUpdated }) {
  const validNext = VALID_TRANSITIONS[referral?.status] || [];
  const [newStatus, setNewStatus] = useState(validNext[0] || '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [outcomeMode, setOutcomeMode] = useState(false);
  const [maternal, setMaternal] = useState('unknown');
  const [neonatal, setNeonatal] = useState('unknown');
  const [outcomeNotes, setOutcomeNotes] = useState('');

  const handleUpdate = async () => {
    setSaving(true); setError('');
    try {
      const { data } = await referralsApi.updateStatus(referral.id, newStatus, note);
      if (['RECEIVED', 'COMPLETED'].includes(newStatus)) {
        setOutcomeMode(true);
        setSaving(false);
      } else {
        onUpdated(data);
      }
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  };

  const handleOutcome = async () => {
    setSaving(true); setError('');
    try {
      const { data } = await referralsApi.outcome(referral.id, { maternal_outcome: maternal, neonatal_outcome: neonatal, outcome_notes: outcomeNotes });
      onUpdated(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally { setSaving(false); }
  };

  if (!referral) return null;

  return (
    <Modal visible={visible} onClose={onClose} title={outcomeMode ? 'Record Outcome' : 'Update Referral Status'}>
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      {validNext.length === 0 ? (
        <Text style={styles.emptyText}>Referral is in a terminal state ({referral.status}).</Text>
      ) : outcomeMode ? (
        <>
          <Select label="Maternal Outcome" value={maternal} onValueChange={setMaternal} options={[{ value: 'unknown', label: 'Unknown' }, { value: 'survived', label: 'Survived' }, { value: 'died', label: 'Died' }]} />
          <Select label="Neonatal Outcome" value={neonatal} onValueChange={setNeonatal} options={[{ value: 'unknown', label: 'Unknown' }, { value: 'survived', label: 'Survived' }, { value: 'died', label: 'Died' }]} />
          <Input label="Outcome Notes" value={outcomeNotes} onChangeText={setOutcomeNotes} multiline numberOfLines={2} />
          <View style={styles.modalActions}>
            <Button title="Skip" variant="outline" onPress={onClose} style={{ flex: 1 }} />
            <Button title="Save Outcome" onPress={handleOutcome} loading={saving} style={{ flex: 1 }} />
          </View>
        </>
      ) : (
        <>
          <Select label="New Status" value={newStatus} onValueChange={setNewStatus} options={validNext.map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))} />
          <Input label="Note (optional)" value={note} onChangeText={setNote} multiline numberOfLines={2} placeholder="Context for this transition…" />
          <View style={styles.modalActions}>
            <Button title="Cancel" variant="outline" onPress={onClose} style={{ flex: 1 }} />
            <Button title="Update Status" onPress={handleUpdate} loading={saving} style={{ flex: 1 }} />
          </View>
        </>
      )}
    </Modal>
  );
}

function EditCaseModal({ visible, onClose, caseData: c, onSaved }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (visible && c) {
      setForm({
        gestational_age_weeks: c.gestational_age_weeks?.toString() || '',
        gravida: c.gravida?.toString() || '', parity: c.parity?.toString() || '',
        presenting_complaint: c.presenting_complaint || '',
        danger_signs: c.danger_signs || [],
        fetal_heart_rate: c.fetal_heart_rate?.toString() || '',
        membranes_status: c.membranes_status || 'unknown',
        obstetric_history: c.obstetric_history || '',
        vital_signs: { ...c.vital_signs },
      });
    }
  }, [visible, c]);

  if (!form) return null;
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const vital_signs = {};
      Object.entries(form.vital_signs || {}).forEach(([k, v]) => { if (v !== '' && v !== null) vital_signs[k] = Number(v); });
      await casesApi.update(c.id, {
        gestational_age_weeks: form.gestational_age_weeks ? Number(form.gestational_age_weeks) : null,
        gravida: form.gravida ? Number(form.gravida) : null,
        parity: form.parity ? Number(form.parity) : null,
        presenting_complaint: form.presenting_complaint,
        danger_signs: form.danger_signs,
        fetal_heart_rate: form.fetal_heart_rate ? Number(form.fetal_heart_rate) : null,
        membranes_status: form.membranes_status,
        obstetric_history: form.obstetric_history,
        vital_signs,
      });
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Edit Case" size="lg">
      <ScrollView style={{ maxHeight: 480 }}>
        <ErrorBanner message={error} onDismiss={() => setError('')} />
        <Input label="Presenting Complaint" value={form.presenting_complaint} onChangeText={set('presenting_complaint')} multiline numberOfLines={2} />
        <Input label="Gestational Age (wks)" value={form.gestational_age_weeks} onChangeText={set('gestational_age_weeks')} keyboardType="number-pad" />
        <Input label="Gravida" value={form.gravida} onChangeText={set('gravida')} keyboardType="number-pad" />
        <Input label="Parity" value={form.parity} onChangeText={set('parity')} keyboardType="number-pad" />
        <Input label="Fetal Heart Rate" value={form.fetal_heart_rate} onChangeText={set('fetal_heart_rate')} keyboardType="number-pad" />
        <Select label="Membranes Status" value={form.membranes_status} onValueChange={set('membranes_status')} options={[{ value: 'unknown', label: 'Unknown' }, { value: 'intact', label: 'Intact' }, { value: 'ruptured', label: 'Ruptured' }]} />
        <Input label="Obstetric History" value={form.obstetric_history} onChangeText={set('obstetric_history')} multiline numberOfLines={2} />
        <Text style={styles.sectionLabel}>Danger Signs</Text>
        <DangerSignPicker value={form.danger_signs} onChange={(v) => setForm((f) => ({ ...f, danger_signs: v }))} />
      </ScrollView>
      <View style={styles.modalActions}>
        <Button title="Cancel" variant="outline" onPress={onClose} style={{ flex: 1 }} />
        <Button title="Save Changes" onPress={handleSave} loading={saving} style={{ flex: 1 }} />
      </View>
    </Modal>
  );
}

function ReferralCreateModal({ visible, onClose, caseData: c, onSaved }) {
  const [mode, setMode] = useState('ai'); // 'ai' | 'manual'
  const [suggestion, setSuggestion] = useState(null);
  const [facilities, setFacilities] = useState([]);
  const [facilitiesFromCache, setFacilitiesFromCache] = useState(false);
  const [facilitySearch, setFacilitySearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [override, setOverride] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [createdReferral, setCreatedReferral] = useState(null);
  const [queuedOffline, setQueuedOffline] = useState(false);
  const { submitOrQueue } = useOfflineQueue();
  const overrideVoiceFields = [{ key: 'override', label: 'Override Reason', get: () => override, set: setOverride }];
  const overrideVoiceEntry = useVoiceEntry(overrideVoiceFields);

  React.useEffect(() => {
    if (!visible) return;
    setLoading(true); setSuggestion(null); setSelected(null); setError(''); setCreatedReferral(null); setQueuedOffline(false); setFacilitySearch('');
    referralsApi.suggest(c.id)
      .then(({ data }) => { setSuggestion(data); if (data.recommended_facility) setSelected(data.recommended_facility); })
      .catch(() => setError('Could not load AI suggestions. Try manual selection.'))
      .finally(() => setLoading(false));
    // Cached so manual facility selection still works with no signal — without
    // this, "Choose Manually" would offer nothing to choose from when offline.
    cachedFetch('facilities_list', () => facilitiesApi.list().then((r) => r.data))
      .then(({ data, fromCache }) => {
        setFacilities(Array.isArray(data) ? data : (data.results || []));
        setFacilitiesFromCache(fromCache);
      })
      .catch(() => {});
  }, [visible, c?.id]);

  const options = mode === 'ai'
    ? [suggestion?.recommended_facility, ...(suggestion?.alternatives || [])].filter(Boolean)
    : facilities.filter((f) => {
        const q = facilitySearch.toLowerCase();
        return !q || f.name?.toLowerCase().includes(q) || f.level_display?.toLowerCase().includes(q);
      });
  const needsOverride = selected && suggestion?.recommended_facility && selected.id !== suggestion.recommended_facility.id;

  const handleCreate = async () => {
    if (!selected) return;
    setCreating(true); setError('');
    try {
      const payload = {
        emergency_case_id: c.id, receiving_facility_id: selected.id,
        engine_recommendation_id: suggestion?.recommended_facility?.id || null,
        engine_version: suggestion?.engine_version || '',
        override_reason: mode === 'manual' || needsOverride ? override : '',
      };
      const result = await submitOrQueue({
        method: 'post',
        url: '/api/referrals/create/',
        data: payload,
        meta: { kind: QueueKinds.REFERRAL_CREATE, label: `Referral to ${selected.name}`, caseId: c.id },
      });
      if (result.queued) {
        // No server id yet, so there's nothing for PostReferralTransportModal
        // to link a transport request to — that has to wait until this
        // syncs. Say so plainly instead of silently skipping the step.
        setQueuedOffline(true);
      } else {
        setCreatedReferral(result.response.data); // move to the transport-assignment step
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally { setCreating(false); }
  };

  if (createdReferral) {
    return (
      <PostReferralTransportModal
        visible={visible} onClose={onClose}
        referral={createdReferral} facilityName={selected?.name}
        onDone={onSaved}
      />
    );
  }

  if (queuedOffline) {
    return (
      <Modal visible={visible} onClose={onClose} title="Referral Saved" size="lg">
        <Card style={{ borderWidth: 1, borderColor: Colors.warningLight, borderStyle: 'dashed' }}>
          <View style={styles.refHeaderRow}>
            <Text style={styles.cardLabel}>Referral to {selected?.name}</Text>
            <Badge label="Pending sync" variant="warning" />
          </View>
          <Text style={styles.emptyText}>
            Saved on this device — no connection right now. It will be sent to the server automatically once you're back online, and you can assign transport for it after that.
          </Text>
        </Card>
        <View style={styles.modalActions}>
          <Button title="Done" onPress={() => { onSaved(); onClose(); }} style={{ flex: 1 }} />
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} onClose={onClose} title="Create Referral" size="lg">
      <View style={styles.modeRow}>
        <TouchableOpacity style={[styles.modeBtn, mode === 'ai' && styles.modeBtnActive]} onPress={() => setMode('ai')}>
          <Text style={[styles.modeBtnText, mode === 'ai' && styles.modeBtnTextActive]}>AI Suggested</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modeBtn, mode === 'manual' && styles.modeBtnActive]} onPress={() => setMode('manual')}>
          <Text style={[styles.modeBtnText, mode === 'manual' && styles.modeBtnTextActive]}>Choose Manually</Text>
        </TouchableOpacity>
      </View>
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      {mode === 'manual' && (
        <>
          <Input
            value={facilitySearch} onChangeText={setFacilitySearch}
            placeholder="Search by facility name or level…" icon="search-outline"
          />
          {facilitiesFromCache && (
            <Text style={styles.cacheNotice}>Showing facilities saved from your last connection — may be outdated.</Text>
          )}
        </>
      )}
      <ScrollView style={{ maxHeight: 340 }}>
        {loading && mode === 'ai' ? <Spinner /> : options.map((f, i) => (
          <TouchableOpacity key={f.id} style={[styles.facilityRow, selected?.id === f.id && styles.facilityRowActive]} onPress={() => setSelected(f)}>
            <Text style={styles.facilityName}>{f.name}</Text>
            {mode === 'ai' && i === 0 && <Badge label="Recommended" variant="success" />}
          </TouchableOpacity>
        ))}
        {mode === 'manual' && options.length === 0 && (
          <Text style={styles.emptyText}>No facilities match "{facilitySearch}"</Text>
        )}
      </ScrollView>
      {(mode === 'manual' || needsOverride) && (
        <>
          <Text style={styles.fieldLabelText}>Override Reason <Text style={{ color: Colors.dangerDark }}>*</Text></Text>
          <VoiceEntryTrigger onPress={overrideVoiceEntry.start} count={overrideVoiceFields.length} />
          <Input value={override} onChangeText={setOverride} multiline numberOfLines={2} placeholder="Why this facility?" />
        </>
      )}
      <View style={styles.modalActions}>
        <Button title="Cancel" variant="outline" onPress={onClose} style={{ flex: 1 }} />
        <Button title="Create Referral" onPress={handleCreate} loading={creating} disabled={!selected || ((mode === 'manual' || needsOverride) && !override)} style={{ flex: 1 }} />
      </View>
      <VoiceEntryBar voiceEntry={overrideVoiceEntry} />
    </Modal>
  );
}

// ─── Post-referral-creation transport assignment step ──────────────────────────
// Matches web's CreateReferralModal 'transport' step: offers available vehicles
// and links the TransportRequest to the newly-created referral via `referral`.
function PostReferralTransportModal({ visible, onClose, referral, facilityName, onDone }) {
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    transportApi.vehicles.available()
      .then(({ data }) => setVehicles(Array.isArray(data) ? data : (data.results || [])))
      .catch(() => setVehicles([]))
      .finally(() => setLoading(false));
  }, []);

  const handleAssign = async () => {
    if (!selectedVehicle) return;
    setSaving(true); setError('');
    try {
      await transportApi.requests.create({
        vehicle: selectedVehicle.id,
        referral: referral.id,
        ...(notes && { notes }),
      });
      onDone();
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to assign transport.');
      setSaving(false);
    }
  };

  const VEHICLE_ICON = { ambulance: '🚑', car: '🚗', motorcycle: '🏍️', tricycle: '🛺', truck: '🚛', other: '🚐' };

  return (
    <Modal visible={visible} onClose={onClose} title="Assign Transport">
      <View style={styles.successBanner}>
        <Ionicons name="checkmark-circle" size={18} color={Colors.successDark} />
        <View>
          <Text style={styles.successBannerTitle}>Referral created successfully</Text>
          <Text style={styles.successBannerSub}>{facilityName}</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>Assign a vehicle (optional)</Text>
      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {loading ? <Spinner /> : vehicles.length === 0 ? (
        <Text style={styles.emptyText}>No vehicles available. You can assign transport later from the referral detail.</Text>
      ) : (
        <ScrollView style={{ maxHeight: 260 }}>
          {vehicles.map((v) => (
            <TouchableOpacity key={v.id} style={[styles.facilityRow, selectedVehicle?.id === v.id && styles.facilityRowActive]} onPress={() => setSelectedVehicle(v)}>
              <Text style={{ fontSize: 18 }}>{VEHICLE_ICON[v.vehicle_type] || '🚗'}</Text>
              <View style={{ flex: 1, marginLeft: Spacing[2] }}>
                <Text style={styles.facilityName}>{v.registration}</Text>
                <Text style={styles.vehicleSub}>{v.vehicle_type?.replace(/_/g, ' ')}{v.driver_name ? ` · ${v.driver_name}` : ''}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {!!selectedVehicle?.driver_name && (
        <View style={styles.driverCard}>
          <View>
            <Text style={styles.driverLabel}>Assigned Driver</Text>
            <Text style={styles.driverName}>{selectedVehicle.driver_name}</Text>
            {!!selectedVehicle.driver_phone && <Text style={styles.driverPhone}>{selectedVehicle.driver_phone}</Text>}
          </View>
        </View>
      )}

      {!!selectedVehicle && (
        <Input label="Notes (optional)" value={notes} onChangeText={setNotes} multiline numberOfLines={2} placeholder="Any notes for the driver…" />
      )}

      <View style={styles.modalActions}>
        <Button title="Skip for now" variant="outline" onPress={onDone} style={{ flex: 1 }} />
        <Button title="Assign & Finish" onPress={handleAssign} loading={saving} disabled={!selectedVehicle} style={{ flex: 1 }} />
      </View>
    </Modal>
  );
}

function TransportRequestModal({ visible, onClose, onSaved, caseId }) {
  const [available, setAvailable] = useState([]);
  const [vehicle, setVehicle] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const notesVoiceFields = [{ key: 'notes', label: 'Notes', get: () => notes, set: setNotes }];
  const notesVoiceEntry = useVoiceEntry(notesVoiceFields);
  const [transportSpeakable, setTransportSpeakable] = useState(null);
  const transportReadAloud = useReadAloud(transportSpeakable ? [{ label: 'AI transport recommendation', text: transportSpeakable }] : []);

  React.useEffect(() => {
    if (!visible) return;
    setLoading(true);
    transportApi.vehicles.available().then(({ data }) => setAvailable(Array.isArray(data) ? data : (data.results || []))).catch(() => setError('Could not load vehicles.')).finally(() => setLoading(false));
  }, [visible]);

  const handleSubmit = async () => {
    setSaving(true); setError('');
    try {
      await transportApi.requests.create({ ...(vehicle && { vehicle }), ...(notes && { notes }) });
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); setSaving(false); }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Request Transport">
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      {caseId && !loading && (
        <>
          <ReadAloudTrigger readAloud={transportReadAloud} />
          <TransportRecommendPanel
            caseId={caseId}
            availableVehicles={available}
            onSelect={(vehicleId) => setVehicle(vehicleId)}
            onSpeakableText={setTransportSpeakable}
          />
        </>
      )}
      {loading ? <Spinner /> : (
        <Select label="Vehicle" value={vehicle} onValueChange={setVehicle} placeholder="Any available"
          options={[{ value: '', label: '— Any available —' }, ...available.map((v) => ({ value: v.id, label: `${v.registration} (${v.vehicle_type?.replace(/_/g, ' ')})` }))]} />
      )}
      <VoiceEntryTrigger onPress={notesVoiceEntry.start} count={notesVoiceFields.length} />
      <Input label="Notes" value={notes} onChangeText={setNotes} multiline numberOfLines={2} />
      <View style={styles.modalActions}>
        <Button title="Cancel" variant="outline" onPress={onClose} style={{ flex: 1 }} />
        <Button title="Request" onPress={handleSubmit} loading={saving} style={{ flex: 1 }} />
      </View>
      <VoiceEntryBar voiceEntry={notesVoiceEntry} />
    </Modal>
  );
}

function ConsultationRequestModal({ visible, onClose, onSaved }) {
  const [specialists, setSpecialists] = useState([]);
  const [specialist, setSpecialist] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const notesVoiceFields = [{ key: 'notes', label: 'Notes', get: () => notes, set: setNotes }];
  const notesVoiceEntry = useVoiceEntry(notesVoiceFields);

  React.useEffect(() => {
    if (!visible) return;
    setLoading(true);
    consultationsApi.specialists.available().then(({ data }) => setSpecialists(Array.isArray(data) ? data : (data.results || []))).catch(() => setError('Could not load specialists.')).finally(() => setLoading(false));
  }, [visible]);

  const handleSubmit = async () => {
    setSaving(true); setError('');
    try {
      await consultationsApi.create({ ...(specialist && { specialist }), ...(notes && { notes }) });
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); setSaving(false); }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Request Consultation">
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      {loading ? <Spinner /> : (
        <Select label="Specialist" value={specialist} onValueChange={setSpecialist} placeholder="Any available"
          options={[{ value: '', label: '— Any available —' }, ...specialists.map((s) => ({ value: s.id, label: `${s.user_name} · ${s.specialty_display || s.specialty}` }))]} />
      )}
      <VoiceEntryTrigger onPress={notesVoiceEntry.start} count={notesVoiceFields.length} />
      <Input label="Notes" value={notes} onChangeText={setNotes} multiline numberOfLines={2} />
      <View style={styles.modalActions}>
        <Button title="Cancel" variant="outline" onPress={onClose} style={{ flex: 1 }} />
        <Button title="Request" onPress={handleSubmit} loading={saving} style={{ flex: 1 }} />
      </View>
      <VoiceEntryBar voiceEntry={notesVoiceEntry} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing[1] },
  fieldLabelText: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[4], paddingTop: Spacing[5], paddingBottom: Spacing[3],
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: Typography.md, fontWeight: Typography.semibold, color: Colors.textPrimary },
  actionRow: { flexDirection: 'row', gap: Spacing[2] },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 10, ...Shadow.sm },
  actionBtnText: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.primary },
  cardLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.gray400, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing[2] },
  patientName: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  kvKey: { fontSize: Typography.xs, color: Colors.gray400 },
  kvVal: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  notesText: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  notesTextSm: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 6 },
  emptyText: { fontSize: Typography.sm, color: Colors.gray400 },
  cacheNotice: { fontSize: Typography.xs, color: Colors.warningDark, marginTop: 4, marginBottom: 4 },
  vitalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  vitalBox: { width: '30%', backgroundColor: Colors.gray50, borderRadius: Radius.md, padding: Spacing[2], alignItems: 'center' },
  vitalVal: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  vitalLabel: { fontSize: 10, color: Colors.gray400, marginTop: 2, textAlign: 'center' },
  refHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing[2] },
  refRoute: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  refFacility: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary, flexShrink: 1 },
  refOutcomeRow: { flexDirection: 'row', gap: Spacing[4], marginTop: Spacing[2], paddingTop: Spacing[2], borderTopWidth: 1, borderTopColor: Colors.gray100 },
  noteRow: { paddingVertical: Spacing[2], borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  noteText: { fontSize: Typography.sm, color: Colors.textPrimary },
  noteMeta: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  modalActions: { flexDirection: 'row', gap: Spacing[2], marginTop: Spacing[3] },
  sectionLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.gray400, textTransform: 'uppercase', marginTop: Spacing[2], marginBottom: Spacing[2] },
  modeRow: { flexDirection: 'row', gap: Spacing[2], marginBottom: Spacing[3] },
  modeBtn: { flex: 1, paddingVertical: 8, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  modeBtnActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  modeBtnText: { fontSize: Typography.xs, fontWeight: Typography.medium, color: Colors.textSecondary },
  modeBtnTextActive: { color: Colors.primaryDark },
  facilityRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing[3], borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing[2] },
  facilityRowActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  facilityName: { fontSize: Typography.sm, color: Colors.textPrimary },
  successBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.successLight, borderRadius: Radius.md, padding: Spacing[3], marginBottom: Spacing[3] },
  successBannerTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.successDark },
  successBannerSub: { fontSize: Typography.xs, color: Colors.successDark, marginTop: 2 },
  vehicleSub: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2, textTransform: 'capitalize' },
  driverCard: { backgroundColor: Colors.successLight, borderRadius: Radius.md, padding: Spacing[3], marginBottom: Spacing[2] },
  driverLabel: { fontSize: 10, fontWeight: Typography.bold, color: Colors.gray400, textTransform: 'uppercase' },
  driverName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary, marginTop: 2 },
  driverPhone: { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: 1 },
});
