import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { patientsApi, getErrorMessage } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useOfflineQueue } from '../../contexts/OfflineQueueContext';
import { QueueKinds, isQueueItemFailed } from '../../utils/offlineQueue';
import {
  Input, Select, Button, Modal, Spinner, Badge, ErrorBanner, Card,
} from '../../components/ui';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';
import RiskNarratePanel from '../../components/ai/RiskNarratePanel';
import ANCAnomalyPanel from '../../components/ai/ANCAnomalyPanel';
import VoiceEntryBar, { VoiceEntryTrigger } from '../../components/voice/VoiceEntryBar';
import ReadAloudTrigger from '../../components/voice/ReadAloudBar';
import useVoiceEntry from '../../hooks/useVoiceEntry';
import useReadAloud from '../../hooks/useReadAloud';

const RISK_VARIANT = { high: 'danger', medium: 'warning', low: 'success' };
const OUTCOME_COLOR = { survived: Colors.successDark, died: Colors.dangerDark, unknown: Colors.gray400 };
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'anc',      label: 'ANC Visits' },
  { id: 'cases',    label: 'Cases' },
  { id: 'consent',  label: 'Consent' },
];

export default function PatientDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const { isHealthWorker, isFacilityAdmin, isSuperadmin } = useAuth();
  const canManage = isHealthWorker || isFacilityAdmin || isSuperadmin;

  const [patient, setPatient]   = useState(null);
  const [cases, setCases]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [tab, setTab]           = useState('overview');
  const [computing, setComputing] = useState(false);
  const [ancModal, setAncModal]         = useState(false);
  const [consentModal, setConsentModal] = useState(false);
  const [portalModal, setPortalModal]   = useState(false);
  const [riskSpeakable, setRiskSpeakable] = useState(null);
  const riskReadAloud = useReadAloud(riskSpeakable ? [{ label: 'AI risk explanation', text: riskSpeakable }] : []);
  const { pending, syncVersion } = useOfflineQueue();

  const queuedAncVisits = pending
    .filter((item) => item.meta?.kind === QueueKinds.ANC_VISIT_CREATE && item.meta?.patientId === id)
    .map((item) => ({
      id: `queued:${item.id}`,
      __queued: true,
      __failed: isQueueItemFailed(item),
      visit_date: item.data.visit_date,
      gestational_age_weeks: item.data.gestational_age_weeks,
      bp_systolic: item.data.bp_systolic,
      bp_diastolic: item.data.bp_diastolic,
      fetal_heart_rate: item.data.fetal_heart_rate,
      weight_kg: item.data.weight_kg,
      concerns: item.data.concerns,
      notes: item.data.notes,
      facility_name: null,
      conducted_by_name: null,
    }));

  const load = useCallback(async () => {
    try {
      const [pRes, cRes] = await Promise.all([patientsApi.detail(id), patientsApi.cases(id)]);
      setPatient(pRes.data);
      setCases(Array.isArray(cRes.data) ? cRes.data : (cRes.data.results || []));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (syncVersion > 0) load();
  }, [syncVersion]);

  const handleComputeRisk = async () => {
    setComputing(true);
    try {
      await patientsApi.computeRisk(id);
      const { data } = await patientsApi.detail(id);
      setPatient(data);
    } catch (err) { /* silent, non-critical */ }
    finally { setComputing(false); }
  };

  if (loading) return <Spinner fullScreen />;
  if (error || !patient) {
    return (
      <View style={styles.container}>
        <Header navigation={navigation} title="Patient" />
        <ErrorBanner message={error || 'Patient not found.'} />
      </View>
    );
  }

  const p = patient;

  return (
    <View style={styles.container}>
      <Header navigation={navigation} title={p.patient_name || 'Unnamed Patient'} />

      <ScrollView contentContainerStyle={{ paddingBottom: Spacing[10] }}>
        <View style={styles.badgeRow}>
          <Badge label={`${p.risk_level?.toUpperCase() || 'LOW'} RISK`} variant={RISK_VARIANT[p.risk_level] || 'default'} />
          {p.has_portal_access && <Badge label="Portal active" variant="info" />}
          <Text style={styles.hospitalId}>ID: {p.hospital_id || '—'}</Text>
        </View>

        {canManage && (
          <View style={styles.actionRow}>
            <Button
              title="Recompute Risk" variant="outline" size="sm" icon="refresh"
              loading={computing} onPress={handleComputeRisk} style={{ flex: 1 }}
            />
            <Button
              title={p.has_portal_access ? 'Revoke Portal' : 'Grant Portal'}
              variant="outline" size="sm" icon="globe-outline"
              onPress={() => setPortalModal(true)} style={{ flex: 1 }}
            />
          </View>
        )}

        {p.risk_flags?.length > 0 && (
          <View style={styles.flagsRow}>
            {p.risk_flags.map((flag, i) => (
              <View key={i} style={styles.flagChip}>
                <Ionicons name="warning-outline" size={12} color={Colors.warningDark} />
                <Text style={styles.flagText}>{flag}</Text>
              </View>
            ))}
          </View>
        )}

        {p.risk_level && p.risk_flags?.length > 0 && (
          <View style={{ paddingHorizontal: Spacing[4], marginBottom: Spacing[2] }}>
            <ReadAloudTrigger readAloud={riskReadAloud} />
            <RiskNarratePanel patientId={p.id} riskLevel={p.risk_level} riskFlags={p.risk_flags} onSpeakableText={setRiskSpeakable} />
          </View>
        )}

        <View style={styles.tabBar}>
          {TABS.map((t) => (
            <TouchableOpacity key={t.id} onPress={() => setTab(t.id)} style={[styles.tabBtn, tab === t.id && styles.tabBtnActive]}>
              <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>
                {t.label}{t.id === 'anc' ? ` (${(p.anc_visit_log?.length || 0) + queuedAncVisits.length})` : t.id === 'cases' ? ` (${cases.length})` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.tabContent}>
          {tab === 'overview' && <OverviewTab p={p} />}
          {tab === 'anc' && (
            <AncTab
              visits={[...queuedAncVisits, ...(p.anc_visit_log || [])]}
              canManage={canManage}
              onAdd={() => setAncModal(true)}
              patientId={p.id}
            />
          )}
          {tab === 'cases' && (
            <CasesTab
              cases={cases} canManage={canManage}
              onOpen={(c) => navigation.navigate('CasesTab', { screen: 'CaseDetail', params: { id: c.id } })}
              onNew={() => navigation.navigate('CasesTab', { screen: 'CaseCreate', params: { patientId: id } })}
            />
          )}
          {tab === 'consent' && (
            <ConsentTab p={p} canManage={canManage} onRecord={() => setConsentModal(true)} />
          )}
        </View>
      </ScrollView>

      <AddAncVisitModal visible={ancModal} onClose={() => setAncModal(false)} patientId={id} onSaved={() => { setAncModal(false); load(); }} />
      <ConsentModal visible={consentModal} onClose={() => setConsentModal(false)} patientId={id} onSaved={() => { setConsentModal(false); load(); }} />
      <PortalModal
        visible={portalModal} onClose={() => setPortalModal(false)} patientId={id}
        hasPortal={p.has_portal_access} onSaved={() => { setPortalModal(false); load(); }}
      />
    </View>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────
function Header({ navigation, title }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + Spacing[5] }]}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={{ width: 36 }} />
    </View>
  );
}

// ─── Overview tab ───────────────────────────────────────────────────────────────
function OverviewTab({ p }) {
  const demo = [
    ['Age', `${p.age} years`],
    ['Date of Birth', fmt(p.date_of_birth)],
    ['Town', p.town || '—'],
    ['Blood Group', p.blood_group || '—'],
    ['Phone', p.patient_phone_number || '—'],
    ['Registered at', p.registered_at_facility_name || '—'],
  ];
  const obstetric = [
    ['Gravida', p.gravida ?? '—'],
    ['Parity', p.parity ?? '—'],
    ['Expected Delivery', fmt(p.expected_delivery_date)],
    ['ANC Visits', p.anc_visits],
  ];
  const readAloudItems = [
    { label: 'Patient', text: `${p.patient_name || 'Unnamed patient'}, ${p.age} years, ${p.town || 'location unknown'}` },
    { label: 'Blood group', text: p.blood_group || 'not recorded' },
    { label: 'Obstetric summary', text: `Gravida ${p.gravida ?? 'unknown'}, parity ${p.parity ?? 'unknown'}, ${p.anc_visits || 0} ANC visits` },
    ...((p.next_of_kin_name || p.next_of_kin_phone) ? [{ label: 'Next of kin', text: `${p.next_of_kin_name || 'unnamed'}, ${p.next_of_kin_relationship || ''}, ${p.next_of_kin_phone || 'no phone on file'}` }] : []),
    ...(p.notes ? [{ label: 'Background notes', text: p.notes }] : []),
  ];
  const readAloud = useReadAloud(readAloudItems);
  return (
    <View style={{ gap: Spacing[3] }}>
      <ReadAloudTrigger readAloud={readAloud} />
      <Card>
        <Text style={styles.cardLabel}>Demographics</Text>
        {demo.map(([k, v]) => (
          <View key={k} style={styles.kvRow}><Text style={styles.kvKey}>{k}</Text><Text style={styles.kvVal}>{v}</Text></View>
        ))}
      </Card>
      <Card>
        <Text style={styles.cardLabel}>Obstetric Summary</Text>
        {obstetric.map(([k, v]) => (
          <View key={k} style={styles.kvRow}><Text style={styles.kvKey}>{k}</Text><Text style={styles.kvVal}>{v}</Text></View>
        ))}
      </Card>
      {(p.next_of_kin_name || p.next_of_kin_phone) && (
        <Card>
          <Text style={styles.cardLabel}>Next of Kin</Text>
          <Text style={styles.nokName}>{p.next_of_kin_name}</Text>
          <Text style={styles.kvKey}>{p.next_of_kin_relationship} · {p.next_of_kin_phone}</Text>
        </Card>
      )}
      {!!p.notes && (
        <Card>
          <Text style={styles.cardLabel}>Background Notes</Text>
          <Text style={styles.notesText}>{p.notes}</Text>
        </Card>
      )}
    </View>
  );
}

// ─── ANC tab ────────────────────────────────────────────────────────────────────
function AncTab({ visits, canManage, onAdd, patientId }) {
  const [ancSpeakable, setAncSpeakable] = useState(null);
  const ancReadAloud = useReadAloud(ancSpeakable ? [{ label: 'AI ANC pattern analysis', text: ancSpeakable }] : []);
  return (
    <View style={{ gap: Spacing[2] }}>
      {canManage && <Button title="Log ANC Visit" icon="add" size="sm" onPress={onAdd} style={{ alignSelf: 'flex-end' }} />}
      <ReadAloudTrigger readAloud={ancReadAloud} />
      <ANCAnomalyPanel patientId={patientId} visitCount={visits.length} onSpeakableText={setAncSpeakable} />
      {visits.length === 0 ? (
        <Card><Text style={styles.emptyText}>No ANC visits recorded yet.</Text></Card>
      ) : visits.map((v) => (
        <Card key={v.id} style={v.__queued && { borderWidth: 1, borderColor: Colors.warningLight, borderStyle: 'dashed' }}>
          <View style={styles.ancHeaderRow}>
            <View>
              <Text style={styles.ancDate}>{fmt(v.visit_date)}{v.gestational_age_weeks ? ` · ${v.gestational_age_weeks} weeks` : ''}</Text>
              <Text style={styles.ancMeta}>{v.facility_name || 'No facility'} · {v.conducted_by_name || 'Unknown'}</Text>
            </View>
            {v.__queued && <Badge label={v.__failed ? 'Sync failed' : 'Pending sync'} variant={v.__failed ? 'danger' : 'warning'} />}
          </View>
          <View style={styles.ancStatsRow}>
            {!!v.bp_systolic && <Text style={styles.ancStat}>BP {v.bp_systolic}/{v.bp_diastolic}</Text>}
            {!!v.weight_kg && <Text style={styles.ancStat}>{v.weight_kg} kg</Text>}
            {!!v.fetal_heart_rate && <Text style={styles.ancStat}>FHR {v.fetal_heart_rate}</Text>}
          </View>
          {!!v.concerns && <Text style={styles.concernText}>{v.concerns}</Text>}
          {!!v.notes && <Text style={styles.notesTextSm}>{v.notes}</Text>}
        </Card>
      ))}
    </View>
  );
}

// ─── Cases tab ──────────────────────────────────────────────────────────────────
function CasesTab({ cases, canManage, onOpen, onNew }) {
  return (
    <View style={{ gap: Spacing[2] }}>
      {canManage && <Button title="New Emergency Case" icon="add" size="sm" onPress={onNew} style={{ alignSelf: 'flex-end' }} />}
      {cases.length === 0 ? (
        <Card><Text style={styles.emptyText}>No emergency cases recorded for this patient.</Text></Card>
      ) : cases.map((c) => (
        <TouchableOpacity key={c.id} onPress={() => onOpen(c)}>
          <Card>
            <Text style={styles.caseComplaint} numberOfLines={1}>{c.presenting_complaint || 'No complaint recorded'}</Text>
            <Text style={styles.ancMeta}>{c.referring_facility_name} · {fmtDateTime(c.created_at)}</Text>
            {c.danger_signs?.length > 0 && (
              <View style={styles.dsRow}>
                {c.danger_signs.slice(0, 3).map((s) => <Badge key={s} label={s.replace(/_/g, ' ')} variant="danger" />)}
                {c.danger_signs.length > 3 && <Text style={styles.moreText}>+{c.danger_signs.length - 3} more</Text>}
              </View>
            )}
            {c.maternal_outcome && c.maternal_outcome !== 'unknown' && (
              <Text style={[styles.outcomeText, { color: OUTCOME_COLOR[c.maternal_outcome] }]}>Maternal: {c.maternal_outcome}</Text>
            )}
          </Card>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Consent tab ────────────────────────────────────────────────────────────────
function ConsentTab({ p, canManage, onRecord }) {
  return (
    <View style={{ gap: Spacing[3] }}>
      <View style={{ flexDirection: 'row', gap: Spacing[2] }}>
        <Card style={{ flex: 1, borderWidth: 1.5, borderColor: p.consent_given ? Colors.successLight : Colors.border }}>
          <Ionicons name={p.consent_given ? 'shield-checkmark' : 'shield-outline'} size={20} color={p.consent_given ? Colors.successDark : Colors.gray400} />
          <Text style={styles.consentTitle}>{p.consent_given ? 'Consent given' : 'No consent recorded'}</Text>
          {!!p.consent_given_at && <Text style={styles.ancMeta}>On {fmt(p.consent_given_at)}</Text>}
        </Card>
        <Card style={{ flex: 1, borderWidth: 1.5, borderColor: p.has_portal_access ? Colors.infoLight : Colors.border }}>
          <Ionicons name="globe-outline" size={20} color={p.has_portal_access ? Colors.infoDark : Colors.gray400} />
          <Text style={styles.consentTitle}>{p.has_portal_access ? 'Portal access active' : 'No portal account'}</Text>
          <Text style={styles.ancMeta}>{p.has_portal_access ? 'Patient can log in' : 'Disabled'}</Text>
        </Card>
      </View>

      {canManage && <Button title="Record Consent" icon="shield-checkmark-outline" variant="outline" onPress={onRecord} />}

      <Card noPadding>
        <Text style={[styles.cardLabel, { padding: Spacing[4], paddingBottom: 0 }]}>Consent History</Text>
        {!p.consents?.length ? (
          <Text style={[styles.emptyText, { padding: Spacing[4] }]}>No consent records yet.</Text>
        ) : p.consents.map((c) => (
          <View key={c.id} style={styles.consentRow}>
            <Badge
              label={c.action}
              variant={c.action === 'granted' ? 'success' : c.action === 'revoked' ? 'danger' : 'default'}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.consentType}>{c.consent_type?.replace(/_/g, ' ')}</Text>
              {!!c.notes && <Text style={styles.ancMeta}>{c.notes}</Text>}
            </View>
            <Text style={styles.consentMeta}>{c.recorded_by_name} · {fmt(c.timestamp)}</Text>
          </View>
        ))}
      </Card>
    </View>
  );
}

// ─── Add ANC Visit modal ────────────────────────────────────────────────────────
function AddAncVisitModal({ visible, onClose, patientId, onSaved }) {
  const initial = { visit_date: '', gestational_age_weeks: '', weight_kg: '', bp_systolic: '', bp_diastolic: '', fetal_heart_rate: '', fundal_height_cm: '', notes: '', concerns: '' };
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { submitOrQueue } = useOfflineQueue();
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const voiceFields = [
    { key: 'notes', label: 'Notes', get: () => form.notes, set: set('notes') },
    { key: 'concerns', label: 'Concerns', get: () => form.concerns, set: set('concerns') },
  ];
  const voiceEntry = useVoiceEntry(voiceFields);

  const handleSave = async () => {
    if (!form.visit_date) { setError('Visit date is required.'); return; }
    setSaving(true); setError('');
    try {
      const payload = { visit_date: form.visit_date };
      ['gestational_age_weeks', 'weight_kg', 'bp_systolic', 'bp_diastolic', 'fetal_heart_rate', 'fundal_height_cm'].forEach((k) => {
        if (form[k]) payload[k] = Number(form[k]);
      });
      if (form.notes) payload.notes = form.notes;
      if (form.concerns) payload.concerns = form.concerns;

      await submitOrQueue({
        method: 'post',
        url: `/api/cases/patients/${patientId}/anc-visits/`,
        data: payload,
        meta: { kind: QueueKinds.ANC_VISIT_CREATE, label: `ANC visit — ${form.visit_date}`, patientId },
      });
      setForm(initial);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Log ANC Visit" size="lg">
      <ScrollView style={{ maxHeight: 480 }}>
        <ErrorBanner message={error} onDismiss={() => setError('')} />
        <VoiceEntryTrigger onPress={voiceEntry.start} count={voiceFields.length} />
        <Input label="Visit Date" required value={form.visit_date} onChangeText={set('visit_date')} placeholder="YYYY-MM-DD" />
        <Input label="Gestational Age (wks)" value={form.gestational_age_weeks} onChangeText={set('gestational_age_weeks')} keyboardType="number-pad" />
        <Input label="Weight (kg)" value={form.weight_kg} onChangeText={set('weight_kg')} keyboardType="decimal-pad" />
        <Input label="BP Systolic" value={form.bp_systolic} onChangeText={set('bp_systolic')} keyboardType="number-pad" />
        <Input label="BP Diastolic" value={form.bp_diastolic} onChangeText={set('bp_diastolic')} keyboardType="number-pad" />
        <Input label="Fetal HR (bpm)" value={form.fetal_heart_rate} onChangeText={set('fetal_heart_rate')} keyboardType="number-pad" />
        <Input label="Fundal Height (cm)" value={form.fundal_height_cm} onChangeText={set('fundal_height_cm')} keyboardType="decimal-pad" />
        <Text style={styles.fieldLabelText}>Notes</Text>
        <Input value={form.notes} onChangeText={set('notes')} multiline numberOfLines={2} />
        <Text style={styles.fieldLabelText}>Concerns</Text>
        <Input value={form.concerns} onChangeText={set('concerns')} multiline numberOfLines={2} placeholder="Any clinical concerns noted…" />
      </ScrollView>
      <View style={styles.modalActions}>
        <Button title="Cancel" variant="outline" onPress={onClose} style={{ flex: 1 }} />
        <Button title="Log Visit" onPress={handleSave} loading={saving} style={{ flex: 1 }} />
      </View>
      <VoiceEntryBar voiceEntry={voiceEntry} />
    </Modal>
  );
}

// ─── Consent modal ──────────────────────────────────────────────────────────────
const CONSENT_TYPES = [
  { value: 'data_use', label: 'Data Use & Storage' },
  { value: 'portal',   label: 'Patient Portal Access' },
  { value: 'sharing',  label: 'Facility Data Sharing' },
  { value: 'research', label: 'Anonymised Research Use' },
];
const CONSENT_ACTIONS = [
  { value: 'granted', label: 'Granted' },
  { value: 'revoked', label: 'Revoked' },
  { value: 'updated', label: 'Updated' },
];

function ConsentModal({ visible, onClose, patientId, onSaved }) {
  const [form, setForm] = useState({ consent_type: 'data_use', action: 'granted', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const voiceFields = [{ key: 'notes', label: 'Notes', get: () => form.notes, set: (v) => setForm((f) => ({ ...f, notes: v })) }];
  const voiceEntry = useVoiceEntry(voiceFields);

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      await patientsApi.consent.record(patientId, form);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to record consent.');
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Record Consent">
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <VoiceEntryTrigger onPress={voiceEntry.start} count={voiceFields.length} />
      <Select label="Consent Type" required value={form.consent_type} onValueChange={(v) => setForm((f) => ({ ...f, consent_type: v }))} options={CONSENT_TYPES} />
      <Select label="Action" required value={form.action} onValueChange={(v) => setForm((f) => ({ ...f, action: v }))} options={CONSENT_ACTIONS} />
      <Input label="Notes" value={form.notes} onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))} multiline numberOfLines={2} placeholder="Additional context…" />
      <View style={styles.modalActions}>
        <Button title="Cancel" variant="outline" onPress={onClose} style={{ flex: 1 }} />
        <Button title="Record Consent" onPress={handleSave} loading={saving} style={{ flex: 1 }} />
      </View>
      <VoiceEntryBar voiceEntry={voiceEntry} />
    </Modal>
  );
}

// ─── Portal grant/revoke modal ──────────────────────────────────────────────────
function PortalModal({ visible, onClose, patientId, hasPortal, onSaved }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleGrant = async () => {
    if (!form.email || !form.password) { setError('Email and password are required.'); return; }
    setSaving(true); setError('');
    try {
      await patientsApi.portal.grant(patientId, form);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to create portal account.');
    } finally { setSaving(false); }
  };

  const handleRevoke = async () => {
    setSaving(true); setError('');
    try {
      await patientsApi.portal.revoke(patientId);
      onSaved();
    } catch (err) {
      setError('Failed to revoke portal access.');
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} onClose={onClose} title={hasPortal ? 'Revoke Portal Access' : 'Grant Portal Access'}>
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      {hasPortal ? (
        <>
          <Text style={styles.modalBodyText}>This patient currently has a portal account. Revoking will deactivate their login access — their health records will be preserved.</Text>
          <View style={styles.modalActions}>
            <Button title="Cancel" variant="outline" onPress={onClose} style={{ flex: 1 }} />
            <Button title="Revoke Access" variant="danger" icon="close-circle-outline" onPress={handleRevoke} loading={saving} style={{ flex: 1 }} />
          </View>
        </>
      ) : (
        <>
          <Text style={styles.modalBodyText}>Create a portal login for this patient. They will be able to view their profile and referral status.</Text>
          <Input label="Patient Email" required value={form.email} onChangeText={(v) => setForm((f) => ({ ...f, email: v }))} placeholder="patient@email.com" keyboardType="email-address" autoCapitalize="none" />
          <Input label="Temporary Password" required value={form.password} onChangeText={(v) => setForm((f) => ({ ...f, password: v }))} placeholder="Min. 8 characters" secureTextEntry />
          <View style={styles.modalActions}>
            <Button title="Cancel" variant="outline" onPress={onClose} style={{ flex: 1 }} />
            <Button title="Create Account" icon="globe-outline" onPress={handleGrant} loading={saving} style={{ flex: 1 }} />
          </View>
        </>
      )}
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
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], padding: Spacing[4], paddingBottom: Spacing[2], flexWrap: 'wrap' },
  hospitalId: { fontSize: Typography.xs, color: Colors.gray400, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  actionRow: { flexDirection: 'row', gap: Spacing[2], paddingHorizontal: Spacing[4], marginBottom: Spacing[2] },
  flagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2], paddingHorizontal: Spacing[4], marginBottom: Spacing[2] },
  flagChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.warningLight, borderRadius: Radius.md, paddingHorizontal: 10, paddingVertical: 5 },
  flagText: { fontSize: Typography.xs, color: Colors.warningDark },
  tabBar: { flexDirection: 'row', paddingHorizontal: Spacing[4], borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: Spacing[3] },
  tabBtn: { paddingVertical: Spacing[2], paddingHorizontal: Spacing[3], marginRight: Spacing[1] },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
  tabText: { fontSize: Typography.xs, color: Colors.gray400, fontWeight: Typography.medium },
  tabTextActive: { color: Colors.primary, fontWeight: Typography.semibold },
  tabContent: { paddingHorizontal: Spacing[4] },
  cardLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.gray400, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing[2] },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  kvKey: { fontSize: Typography.xs, color: Colors.gray400 },
  kvVal: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  nokName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  notesText: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  notesTextSm: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 4 },
  emptyText: { fontSize: Typography.sm, color: Colors.gray400, textAlign: 'center' },
  ancHeaderRow: { flexDirection: 'row', justifyContent: 'space-between' },
  ancDate: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  ancMeta: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  ancStatsRow: { flexDirection: 'row', gap: Spacing[3], marginTop: Spacing[2] },
  ancStat: { fontSize: Typography.xs, color: Colors.textSecondary },
  concernText: { fontSize: Typography.xs, color: Colors.warningDark, backgroundColor: Colors.warningLight, borderRadius: Radius.sm, padding: 8, marginTop: Spacing[2] },
  caseComplaint: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  dsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing[2], alignItems: 'center' },
  moreText: { fontSize: Typography.xs, color: Colors.gray400 },
  outcomeText: { fontSize: Typography.xs, fontWeight: Typography.medium, marginTop: Spacing[2] },
  consentTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary, marginTop: 6 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[2], padding: Spacing[4], borderTopWidth: 1, borderTopColor: Colors.gray100 },
  consentType: { fontSize: Typography.sm, color: Colors.textPrimary, textTransform: 'capitalize' },
  consentMeta: { fontSize: Typography.xs, color: Colors.gray400 },
  modalActions: { flexDirection: 'row', gap: Spacing[2], marginTop: Spacing[3] },
  modalBodyText: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20, marginBottom: Spacing[2] },
});
