import React, { useState, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  casesApi, facilitiesApi, patientsApi, referralsApi, transportApi, consultationsApi, getErrorMessage,
} from '../../api/client';
import { useOfflineQueue } from '../../contexts/OfflineQueueContext';
import { QueueKinds, isNetworkError } from '../../utils/offlineQueue';
import { generateIdempotencyKey } from '../../utils/idempotencyKey';
import { cachedFetch } from '../../utils/cachedFetch';
import { triggerAutoReferralSms, triggerEmergencyReferralSms } from '../../utils/smsReferralFallback';
import { scoreFacilitiesOffline } from '../../utils/referralEngineOffline';
import { Input, Select, Button, ErrorBanner, Spinner, Badge } from '../../components/ui';
import { DangerSignPicker } from '../../components/ui/dangerSigns';
import VoiceEntryBar, { VoiceEntryTrigger } from '../../components/voice/VoiceEntryBar';
import useVoiceEntry from '../../hooks/useVoiceEntry';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

const BLOOD_GROUPS = ['unknown', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => ({ value: g, label: g }));
const MEMBRANES = [
  { value: 'unknown', label: 'Unknown' }, { value: 'intact', label: 'Intact' }, { value: 'ruptured', label: 'Ruptured' },
];
const VITAL_FIELDS = [
  ['systolic_bp', 'Systolic BP (mmHg)'], ['diastolic_bp', 'Diastolic BP (mmHg)'],
  ['heart_rate', 'Heart Rate (bpm)'], ['respiratory_rate', 'Resp. Rate (/min)'],
  ['temperature', 'Temperature (°C)'], ['spo2', 'SpO2 (%)'],
];
const RISK_VARIANT = { high: 'danger', medium: 'warning', low: 'success' };

const INITIAL_FORM = {
  patient_id: null,
  patient_name: '', patient_phone_number: '', hospital_id: '',
  patient_age: '', patient_town: '', patient_blood_group: 'unknown', patient_anc_visits: '0',
  gestational_age_weeks: '', gravida: '', parity: '',
  presenting_complaint: '', danger_signs: [], membranes_status: 'unknown',
  fetal_heart_rate: '', obstetric_history: '', referring_facility: '',
  vital_signs: { systolic_bp: '', diastolic_bp: '', heart_rate: '', respiratory_rate: '', temperature: '', spo2: '' },
};

export default function CaseCreateScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const preselectedPatientId = route?.params?.patientId || null;
  const [step, setStep] = useState(preselectedPatientId ? 1 : 0); // 0 = patient search, 1 = case form, 2 = actions, 3 = queued offline
  const [form, setForm] = useState(INITIAL_FORM);
  const [createdCase, setCreatedCase] = useState(null);

  useEffect(() => {
    if (preselectedPatientId) {
      patientsApi.detail(preselectedPatientId).then(({ data: p }) => {
        setForm((f) => ({
          ...f,
          patient_id: p.id, patient_name: p.patient_name || '', hospital_id: p.hospital_id || '',
          patient_phone_number: p.patient_phone_number || '', patient_age: String(p.age || ''),
          patient_town: p.town || '', patient_blood_group: p.blood_group || 'unknown',
          patient_anc_visits: String(p.anc_visits || 0),
        }));
      }).catch(() => {});
    }
  }, [preselectedPatientId]);

  const handleClose = () => navigation.goBack();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing[16] }]}>
        <TouchableOpacity onPress={handleClose} style={styles.backBtn}>
          <Ionicons name={step === 2 ? 'close' : 'arrow-back'} size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>{step === 0 ? 'Find Patient' : step === 1 ? 'New Emergency Case' : step === 3 ? 'Case Saved' : 'Next Steps'}</Text>
          <Text style={styles.headerSub}>{step === 0 ? 'Step 1 of 3' : step === 1 ? 'Step 2 of 3' : step === 3 ? 'Saved offline' : 'Step 3 of 3'}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {step === 0 && (
        <PatientSearchStep
          onSelect={(p) => {
            setForm((f) => ({
              ...f,
              patient_id: p.id, patient_name: p.patient_name || '', hospital_id: p.hospital_id || '',
              patient_phone_number: p.patient_phone_number || '', patient_age: String(p.age || ''),
              patient_town: p.town || '', patient_blood_group: p.blood_group || 'unknown',
              patient_anc_visits: String(p.anc_visits || 0),
            }));
            setStep(1);
          }}
          onSkip={() => { setForm((f) => ({ ...f, patient_id: null })); setStep(1); }}
        />
      )}

      {step === 1 && (
        <CaseFormStep
          form={form} setForm={setForm}
          onCancel={handleClose}
          onCreated={(c) => { setCreatedCase(c); setStep(2); }}
          onQueued={() => setStep(3)}
        />
      )}

      {step === 2 && createdCase && (
        <ActionPicker caseData={createdCase} navigation={navigation} />
      )}

      {step === 3 && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.successBox}>
            <Ionicons name="time-outline" size={20} color={Colors.warningDark} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.successTitle, { color: Colors.warningDark }]}>Case saved on this device</Text>
              <Text style={[styles.successSub, { color: Colors.warningDark }]}>
                No connection right now — it will be sent to the server automatically once you're back online.
                Referral, transport, and consultation can be set up for it after that.
              </Text>
            </View>
          </View>
          <Button title="Done" onPress={handleClose} fullWidth />
        </ScrollView>
      )}
    </View>
  );
}

// ─── Step 0: search / link existing patient ────────────────────────────────────
function PatientSearchStep({ onSelect, onSkip }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true); setSearched(true);
    try {
      const { data } = await patientsApi.list({ q: query.trim() });
      setResults(Array.isArray(data) ? data : (data.results || []));
    } catch { setResults([]); }
    finally { setLoading(false); }
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={styles.hintBox}>
        <Text style={styles.hintTitle}>Search for an existing patient</Text>
        <Text style={styles.hintBody}>Linking an existing record prevents duplicates and preserves their full history</Text>
      </View>

      <View style={styles.searchRow}>
        <View style={{ flex: 1 }}>
          <Input value={query} onChangeText={setQuery} placeholder="Search by name, hospital ID, or phone…" icon="search-outline" returnKeyType="search" onSubmitEditing={handleSearch} />
        </View>
        <Button title={loading ? '…' : 'Search'} onPress={handleSearch} disabled={loading || !query.trim()} style={{ marginLeft: Spacing[2], height: 48 }} />
      </View>

      {searched && !loading && results.length === 0 && (
        <Text style={styles.emptyText}>No patients found. You can create a new patient below.</Text>
      )}

      {results.map((p) => (
        <TouchableOpacity key={p.id} style={styles.patientResult} onPress={() => onSelect(p)}>
          <View style={{ flex: 1 }}>
            <View style={styles.resultTitleRow}>
              <Text style={styles.resultName}>{p.patient_name || 'Unnamed patient'}</Text>
              <Badge label={`${p.risk_level?.toUpperCase()} RISK`} variant={RISK_VARIANT[p.risk_level] || 'default'} />
            </View>
            <Text style={styles.resultMeta}>ID: {p.hospital_id || '—'} · Age {p.age} · {p.town || '—'} · {p.anc_visits} ANC visit{p.anc_visits !== 1 ? 's' : ''}</Text>
            {p.case_count > 0 && <Text style={styles.resultCaseCount}>{p.case_count} previous case{p.case_count !== 1 ? 's' : ''}</Text>}
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
        </TouchableOpacity>
      ))}

      <Button title="Create new patient" variant="outline" fullWidth onPress={onSkip} style={{ marginTop: Spacing[4] }} />
    </ScrollView>
  );
}

// ─── Step 1: full case form ─────────────────────────────────────────────────────
function CaseFormStep({ form, setForm, onCancel, onCreated, onQueued }) {
  const [facilities, setFacilities] = useState([]);
  const [facilitiesFromCache, setFacilitiesFromCache] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { submitOrQueue } = useOfflineQueue();

  useEffect(() => {
    // Cached so the required "Referring Facility" field still has options
    // to pick from offline — without this, the case form is unusable with
    // no signal, which defeats the point of queuing the create itself.
    cachedFetch('facilities_list', () => facilitiesApi.list().then((r) => r.data))
      .then(({ data, fromCache }) => {
        setFacilities(Array.isArray(data) ? data : (data.results || []));
        setFacilitiesFromCache(fromCache);
      })
      .catch(() => setError('Could not load facilities.'));
  }, []);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const setVital = (k) => (v) => setForm((f) => ({ ...f, vital_signs: { ...f.vital_signs, [k]: v } }));

  // Every free-text field on this form, in the order it's displayed.
  // Dropdowns (blood group, membranes), the danger-sign multi-select, and
  // number-only fields (age, ANC visits, gestational age, gravida, parity,
  // vitals, fetal heart rate) are intentionally excluded — see useVoiceEntry.
  const voiceFields = [
    ...(!form.patient_id ? [
      { key: 'patient_name', label: 'Patient Name', get: () => form.patient_name, set: set('patient_name') },
      { key: 'hospital_id', label: 'Hospital ID', get: () => form.hospital_id, set: set('hospital_id') },
      { key: 'patient_phone_number', label: 'Phone Number', get: () => form.patient_phone_number, set: set('patient_phone_number') },
      { key: 'patient_town', label: 'Town', get: () => form.patient_town, set: set('patient_town') },
    ] : []),
    { key: 'obstetric_history', label: 'Obstetric History', get: () => form.obstetric_history, set: set('obstetric_history') },
    { key: 'presenting_complaint', label: 'Presenting Complaint', get: () => form.presenting_complaint, set: set('presenting_complaint') },
  ];
  const voiceEntry = useVoiceEntry(voiceFields);

  const handleSubmit = async () => {
    if (!form.patient_age) { setError('Patient age is required.'); return; }
    if (!form.presenting_complaint.trim()) { setError('Presenting complaint is required.'); return; }
    if (!form.referring_facility) { setError('Please select a referring facility.'); return; }
    setError(''); setLoading(true);
    try {
      const vital_signs = {};
      Object.entries(form.vital_signs).forEach(([k, v]) => { if (v !== '') vital_signs[k] = Number(v); });

      const isExisting = !!form.patient_id;
      const common = {
        presenting_complaint: form.presenting_complaint.trim(),
        danger_signs: form.danger_signs,
        gestational_age_weeks: form.gestational_age_weeks ? Number(form.gestational_age_weeks) : null,
        gravida: form.gravida ? Number(form.gravida) : null,
        parity: form.parity ? Number(form.parity) : null,
        membranes_status: form.membranes_status,
        fetal_heart_rate: form.fetal_heart_rate ? Number(form.fetal_heart_rate) : null,
        obstetric_history: form.obstetric_history.trim(),
        vital_signs,
        referring_facility: form.referring_facility,
        // Minted once per submission (not per HTTP attempt) — stays the same
        // if this gets queued offline and retried later, so the backend can
        // recognize a retry of this exact submission and avoid creating a
        // duplicate case/patient.
        idempotency_key: generateIdempotencyKey(),
      };
      const payload = isExisting
        ? { patient_id: form.patient_id, ...common }
        : {
            patient_name: form.patient_name.trim(),
            patient_age: Number(form.patient_age),
            patient_phone_number: form.patient_phone_number.trim(),
            hospital_id: form.hospital_id.trim(),
            patient_town: form.patient_town.trim(),
            patient_blood_group: form.patient_blood_group,
            patient_anc_visits: Number(form.patient_anc_visits) || 0,
            ...common,
          };
      const facilityLabel = facilities.find((f) => f.id === form.referring_facility)?.name || 'facility';
      const result = await submitOrQueue({
        method: 'post',
        url: '/api/cases/',
        data: payload,
        meta: {
          kind: QueueKinds.CASE_CREATE,
          label: `${form.patient_name || 'Case'} — ${facilityLabel}`,
        },
      });
      if (result.queued) {
        onQueued();
      } else {
        onCreated(result.response.data);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <ErrorBanner message={error} onDismiss={() => setError('')} />

        <VoiceEntryTrigger onPress={voiceEntry.start} count={voiceFields.length} />

        {!form.patient_id ? (
          <>
            <Text style={styles.sectionLabel}>Patient Identity</Text>
            <Input label="Patient Name" value={form.patient_name} onChangeText={set('patient_name')} placeholder="Full name" />
            <Input label="Hospital ID" value={form.hospital_id} onChangeText={set('hospital_id')} placeholder="e.g. KBTH-001-2026" />
            <Input label="Phone Number" value={form.patient_phone_number} onChangeText={set('patient_phone_number')} placeholder="e.g. 0244000000" keyboardType="phone-pad" />
            <Input label="Age" required value={form.patient_age} onChangeText={set('patient_age')} placeholder="e.g. 28" keyboardType="number-pad" />
            <Text style={styles.sectionLabel}>Patient Details</Text>
            <Input label="Town" value={form.patient_town} onChangeText={set('patient_town')} placeholder="e.g. Kumasi" />
            <Select label="Blood Group" value={form.patient_blood_group} onValueChange={set('patient_blood_group')} options={BLOOD_GROUPS} />
            <Input label="ANC Visits" value={form.patient_anc_visits} onChangeText={set('patient_anc_visits')} placeholder="0" keyboardType="number-pad" />
          </>
        ) : (
          <View style={styles.linkedBox}>
            <Ionicons name="link" size={16} color={Colors.primaryDark} />
            <Text style={styles.linkedText}>Linked to existing patient: {form.patient_name}</Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>Facility</Text>
        {facilitiesFromCache && (
          <Text style={styles.cacheNotice}>Showing facilities saved from your last connection — may be outdated.</Text>
        )}
        <Select
          label="Referring Facility" required value={form.referring_facility} onValueChange={set('referring_facility')}
          options={facilities.map((f) => ({ value: f.id, label: f.name }))}
        />

        <Text style={styles.sectionLabel}>Obstetric History</Text>
        <Input label="Gestational Age (wks)" value={form.gestational_age_weeks} onChangeText={set('gestational_age_weeks')} placeholder="e.g. 36" keyboardType="number-pad" />
        <Input label="Gravida" value={form.gravida} onChangeText={set('gravida')} placeholder="e.g. 2" keyboardType="number-pad" />
        <Input label="Parity" value={form.parity} onChangeText={set('parity')} placeholder="e.g. 1" keyboardType="number-pad" />
        <Text style={styles.fieldLabelText}>Obstetric History</Text>
        <Input value={form.obstetric_history} onChangeText={set('obstetric_history')} placeholder="Relevant prior complications or surgeries…" multiline numberOfLines={2} />

        <Text style={styles.sectionLabel}>Clinical</Text>
        <Text style={styles.fieldLabelText}>Presenting Complaint <Text style={{ color: Colors.dangerDark }}>*</Text></Text>
        <Input value={form.presenting_complaint} onChangeText={set('presenting_complaint')} placeholder="Chief complaint in your own words…" multiline numberOfLines={2} />

        <Text style={styles.sectionLabel}>Danger Signs</Text>
        <DangerSignPicker value={form.danger_signs} onChange={(v) => setForm((f) => ({ ...f, danger_signs: v }))} />

        <Text style={styles.sectionLabel}>Vital Signs <Text style={styles.sectionSub}>(record what's available)</Text></Text>
        {VITAL_FIELDS.map(([k, label]) => (
          <Input key={k} label={label} value={form.vital_signs[k]} onChangeText={setVital(k)} placeholder="—" keyboardType="decimal-pad" />
        ))}
        <Input label="Fetal Heart Rate (bpm)" value={form.fetal_heart_rate} onChangeText={set('fetal_heart_rate')} placeholder="—" keyboardType="number-pad" />
        <Select label="Membranes Status" value={form.membranes_status} onValueChange={set('membranes_status')} options={MEMBRANES} />

        <Button title="Create Case" onPress={handleSubmit} loading={loading} fullWidth icon="arrow-forward" iconPosition="right" style={{ marginTop: Spacing[3] }} />
        <Button title="Cancel" variant="ghost" fullWidth onPress={onCancel} style={{ marginTop: Spacing[2] }} />
      </ScrollView>
      <VoiceEntryBar voiceEntry={voiceEntry} />
    </KeyboardAvoidingView>
  );
}

// ─── Step 2: post-create action picker ─────────────────────────────────────────
function ActionPicker({ caseData, navigation }) {
  const [panel, setPanel] = useState(null); // 'refer' | 'transport' | 'consult'

  const finish = () => navigation.replace('CaseDetail', { id: caseData.id });

  if (panel === 'refer') return <BackWrap onBack={() => setPanel(null)}><ReferralPanel caseData={caseData} onDone={finish} /></BackWrap>;
  if (panel === 'transport') return <BackWrap onBack={() => setPanel(null)}><TransportPanel onDone={finish} /></BackWrap>;
  if (panel === 'consult') return <BackWrap onBack={() => setPanel(null)}><ConsultationPanel onDone={finish} /></BackWrap>;

  const actions = [
    { key: 'refer', icon: 'swap-horizontal', color: Colors.primary, label: 'Make a Referral', desc: 'Get AI facility suggestions and refer the patient', recommended: true },
    { key: 'transport', icon: 'car-outline', color: Colors.infoDark, label: 'Request Transport', desc: 'Dispatch a vehicle to the patient' },
    { key: 'consult', icon: 'videocam-outline', color: '#7c3aed', label: 'Book a Consultation', desc: 'Connect with a specialist for clinical advice' },
  ];

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.successBox}>
        <Ionicons name="checkmark-circle" size={20} color={Colors.successDark} />
        <View style={{ flex: 1 }}>
          <Text style={styles.successTitle}>Case created successfully</Text>
          <Text style={styles.successSub}>What would you like to do next for this patient?</Text>
        </View>
      </View>

      {actions.map((a) => (
        <TouchableOpacity key={a.key} style={[styles.actionCard, a.recommended && styles.actionCardRecommended]} onPress={() => setPanel(a.key)}>
          <View style={[styles.actionIcon, { backgroundColor: a.color + '20' }]}>
            <Ionicons name={a.icon} size={20} color={a.color} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.actionLabel}>{a.label}</Text>
              {a.recommended && <Badge label="Recommended" variant="primary" />}
            </View>
            <Text style={styles.actionDesc}>{a.desc}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.gray400} />
        </TouchableOpacity>
      ))}

      <Button title="Done — View Case" variant="outline" fullWidth onPress={finish} style={{ marginTop: Spacing[4] }} />
    </ScrollView>
  );
}

function BackWrap({ onBack, children }) {
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <TouchableOpacity onPress={onBack} style={styles.backLink}>
        <Ionicons name="arrow-back" size={14} color={Colors.gray400} />
        <Text style={styles.backLinkText}>Back</Text>
      </TouchableOpacity>
      {children}
    </ScrollView>
  );
}

function ReferralPanel({ caseData, onDone }) {
  const [resultsByMode, setResultsByMode] = useState({ rule_based: null, ai: null });
  const [mode, setMode] = useState('rule_based');
  const [loadingMode, setLoadingMode] = useState('rule_based');
  const [offlineMode, setOfflineMode] = useState(false);
  const [selected, setSelected] = useState(null);
  const [override, setOverride] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [modeError, setModeError] = useState('');
  const [smsNotice, setSmsNotice] = useState('');
  const { submitOrQueue } = useOfflineQueue();

  const current = resultsByMode[mode];
  const allOptions = current ? [current.recommended, ...current.alternatives].filter(Boolean) : [];
  const needsOverride = selected && current?.recommended && selected.id !== current.recommended.id;

  async function loadOfflineFallback() {
    try {
      const { data } = await cachedFetch('facilities_list', () => facilitiesApi.list().then((r) => r.data));
      const facilities = Array.isArray(data) ? data : (data.results || []);
      const offlineResult = scoreFacilitiesOffline(
        {
          dangerSigns: caseData.danger_signs || [],
          referringLat: caseData.referring_facility_lat,
          referringLng: caseData.referring_facility_lng,
        },
        facilities.filter((f) => f.is_active !== false),
      );
      setResultsByMode((prev) => ({
        ...prev,
        rule_based: {
          recommended: offlineResult.recommendedFacility,
          alternatives: offlineResult.alternatives,
          engineVersion: offlineResult.engineVersion,
          engineMode: 'offline_rule_based',
        },
      }));
      setOfflineMode(true);
      setSelected(offlineResult.recommendedFacility);
    } catch {
      setError('No cached facility list available either — connect once to load it, then this will work offline.');
    }
  }

  async function loadMode(targetMode) {
    setModeError(''); setLoadingMode(targetMode);
    try {
      const { data } = await referralsApi.suggest(caseData.id, targetMode);
      const result = {
        recommended: data.recommended_facility || null,
        alternatives: data.alternatives || [],
        engineVersion: data.engine_version || '',
        engineMode: data.engine_mode || targetMode,
      };
      setResultsByMode((prev) => ({ ...prev, [targetMode]: result }));
      setMode(targetMode);
      if (result.recommended) setSelected(result.recommended);
    } catch (err) {
      if (targetMode === 'rule_based' && isNetworkError(err)) {
        // No connectivity — compute a real ranked recommendation on-device
        // instead of only offering an unranked manual pick. This is the
        // gap that used to leave this screen stuck with no way forward
        // when offline beyond picking blind from the cached list.
        await loadOfflineFallback();
      } else if (targetMode === 'ai') {
        setModeError('AI Analysis is unavailable right now — staying on Rule-Based.');
      } else {
        setError('Could not load suggestions. Check your network and try again.');
      }
    } finally {
      setLoadingMode(null);
    }
  }

  useEffect(() => { loadMode('rule_based'); }, [caseData.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function switchMode(targetMode) {
    if (targetMode === mode) return;
    setModeError('');
    if (resultsByMode[targetMode]) {
      setMode(targetMode);
      const opts = [resultsByMode[targetMode].recommended, ...resultsByMode[targetMode].alternatives].filter(Boolean);
      const stillThere = opts.find((o) => o.id === selected?.id);
      setSelected(stillThere || resultsByMode[targetMode].recommended);
    } else {
      loadMode(targetMode);
    }
  }

  const handleCreate = async () => {
    setError(''); setCreating(true); setSmsNotice('');
    try {
      const result = await submitOrQueue({
        method: 'post',
        url: '/api/referrals/create/',
        data: {
          emergency_case_id: caseData.id,
          receiving_facility_id: selected.id,
          engine_recommendation_id: current?.recommended?.id || null,
          engine_version: current?.engineVersion || '',
          engine_mode: current?.engineMode || mode,
          override_reason: override,
          idempotency_key: generateIdempotencyKey(),
        },
        meta: { kind: QueueKinds.REFERRAL_CREATE, label: `${caseData.patient?.patient_name || 'Referral'} → ${selected.name}` },
      });
      if (result.queued) {
        // SMS side-channel (item 5 of the offline-first plan). Primary:
        // gateway-addressed, auto-creates a real referral server-side the
        // moment it's received. Secondary: if the selected facility's own
        // phone number happens to be known, also send it a direct, purely
        // informal heads-up — belt and braces, never blocks the flow.
        const autoSent = await triggerAutoReferralSms({
          age: caseData.patient?.age,
          dangerSigns: caseData.danger_signs,
          patientName: caseData.patient?.patient_name,
          hospitalId: caseData.patient?.hospital_id,
          referenceId: result.item?.id,
        });
        if (selected.phone) {
          triggerEmergencyReferralSms({
            facilityPhone: selected.phone,
            patientName: caseData.patient?.patient_name,
            age: caseData.patient?.age,
            dangerSigns: caseData.danger_signs,
            referringFacilityName: caseData.referring_facility_name,
            referenceId: result.item?.id,
          }).catch(() => {});
        }
        setSmsNotice(
          autoSent
            ? 'Saved offline. A referral SMS has been opened — please tap Send. This will create the referral automatically once received.'
            : 'Saved offline. Could not open the SMS app — please call the facility directly if this is urgent.'
        );
      }
      onDone();
    } catch (err) {
      setError(getErrorMessage(err));
      setCreating(false);
    }
  };

  if (loadingMode === 'rule_based' && !current) return <View style={{ paddingVertical: Spacing[8], alignItems: 'center', gap: Spacing[2] }}><Spinner /><Text style={styles.loadingText}>Finding matching facilities…</Text></View>;

  return (
    <View>
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      {!!smsNotice && <Text style={styles.smsNotice}>{smsNotice}</Text>}

      <View style={styles.modeToggleRow}>
        <TouchableOpacity
          style={[styles.modeToggleBtn, mode === 'rule_based' && styles.modeToggleBtnActive]}
          onPress={() => switchMode('rule_based')}
        >
          <Text style={[styles.modeToggleLabel, mode === 'rule_based' && styles.modeToggleLabelActive]}>⚙️ Rule-Based</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeToggleBtn, mode === 'ai' && styles.modeToggleBtnActive, offlineMode && styles.modeToggleBtnDisabled]}
          onPress={() => switchMode('ai')}
          disabled={offlineMode || loadingMode === 'ai'}
        >
          {loadingMode === 'ai'
            ? <Spinner size="small" />
            : <Text style={[styles.modeToggleLabel, mode === 'ai' && styles.modeToggleLabelActive, offlineMode && styles.modeToggleLabelDisabled]}>✨ AI Analysis</Text>}
        </TouchableOpacity>
      </View>
      {offlineMode && <Text style={styles.cacheNotice}>No connection — AI Analysis needs one. Showing rule-based results computed offline on this device.</Text>}
      {!!modeError && <Text style={styles.cacheNotice}>{modeError}</Text>}

      {allOptions.map((s, i) => (
        <TouchableOpacity key={s.id} style={[styles.facilityCard, selected?.id === s.id && styles.facilityCardActive]} onPress={() => setSelected(s)}>
          <View style={[styles.rankBadge, i === 0 && styles.rankBadgeTop]}><Text style={[styles.rankText, i === 0 && styles.rankTextTop]}>{i + 1}</Text></View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={styles.facilityName}>{s.name}</Text>
              {i === 0 && <Badge label="Recommended" variant="success" />}
              {!!s.level_display && <Badge label={s.level_display} variant="default" />}
            </View>
            <View style={{ flexDirection: 'row', gap: Spacing[3], marginTop: 4 }}>
              {s.distance_km != null && <Text style={styles.facilityMeta}>{s.distance_km.toFixed(1)} km</Text>}
              {s.score != null && <Text style={styles.facilityScore}>Score: {Math.round(s.score)}</Text>}
            </View>
            {mode === 'ai' && !!s.ai_rationale && <Text style={styles.aiRationale}>“{s.ai_rationale}”</Text>}
          </View>
        </TouchableOpacity>
      ))}
      {allOptions.length === 0 && !error && <Text style={styles.emptyText}>No suitable facilities found. You can still create the referral manually from the case detail page.</Text>}

      {needsOverride && (
        <Input label="Override Reason" required value={override} onChangeText={setOverride} placeholder="Explain why you're overriding the engine recommendation…" multiline numberOfLines={2} />
      )}

      <View style={styles.footerRow}>
        <Button title="Skip for now" variant="outline" onPress={onDone} style={{ flex: 1 }} />

        <Button title="Create Referral" icon="swap-horizontal" onPress={handleCreate} loading={creating} disabled={!selected || (needsOverride && !override)} style={{ flex: 2 }} />
      </View>
    </View>
  );
}

function TransportPanel({ onDone }) {
  const [available, setAvailable] = useState([]);
  const [vehicle, setVehicle] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    transportApi.vehicles.available()
      .then(({ data }) => setAvailable(Array.isArray(data) ? data : (data.results || [])))
      .catch(() => setError('Could not load vehicles.'))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await transportApi.requests.create({ ...(vehicle && { vehicle }), ...(notes && { notes }) });
      onDone();
    } catch { setError('Failed to request transport.'); setSaving(false); }
  };

  return (
    <View>
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      {loading ? <Spinner /> : (
        <Select label="Select Vehicle" value={vehicle} onValueChange={setVehicle} placeholder="Any available"
          options={[{ value: '', label: '— Any available —' }, ...available.map((t) => ({ value: t.id, label: `${t.registration} (${t.vehicle_type?.replace(/_/g, ' ')})${t.driver_name ? ` · ${t.driver_name}` : ''}` }))]}
        />
      )}
      <Input label="Notes" value={notes} onChangeText={setNotes} placeholder="Location details, landmarks, case reference…" multiline numberOfLines={2} />
      <View style={styles.footerRow}>
        <Button title="Skip for now" variant="outline" onPress={onDone} style={{ flex: 1 }} />
        <Button title="Request Transport" icon="car-outline" onPress={handleSubmit} loading={saving} style={{ flex: 2 }} />
      </View>
    </View>
  );
}

function ConsultationPanel({ onDone }) {
  const [specialists, setSpecialists] = useState([]);
  const [specialist, setSpecialist] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    consultationsApi.specialists.available()
      .then(({ data }) => setSpecialists(Array.isArray(data) ? data : (data.results || [])))
      .catch(() => setError('Could not load specialists.'))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await consultationsApi.create({ ...(specialist && { specialist }), ...(notes && { notes }) });
      onDone();
    } catch { setError('Failed to request consultation.'); setSaving(false); }
  };

  return (
    <View>
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <Text style={styles.hintBody}>Leave blank to request any available specialist</Text>
      {loading ? <Spinner /> : (
        <Select label="Specialist" value={specialist} onValueChange={setSpecialist} placeholder="Any available"
          options={[{ value: '', label: '— Any available —' }, ...specialists.map((s) => ({ value: s.id, label: `${s.user_name} · ${s.specialty_display || s.specialty}` }))]}
        />
      )}
      <Input label="Notes" value={notes} onChangeText={setNotes} placeholder="Reason for consultation, specific questions…" multiline numberOfLines={2} />
      <View style={styles.footerRow}>
        <Button title="Skip for now" variant="outline" onPress={onDone} style={{ flex: 1 }} />
        <Button title="Book Consultation" icon="videocam-outline" onPress={handleSubmit} loading={saving} style={{ flex: 2 }} />
      </View>
    </View>
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
  headerTitle: { fontSize: Typography.md, fontWeight: Typography.semibold, color: Colors.textPrimary, textAlign: 'center' },
  headerSub: { fontSize: Typography.xs, color: Colors.gray400, textAlign: 'center' },
  scroll: { padding: Spacing[4], paddingBottom: Spacing[10] },
  sectionLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.gray400, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: Spacing[3], marginBottom: Spacing[2] },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing[1] },
  fieldLabelText: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  sectionSub: { textTransform: 'none', fontWeight: Typography.regular },
  hintBox: { backgroundColor: Colors.primaryLight, borderRadius: Radius.md, padding: Spacing[3], marginBottom: Spacing[3] },
  cacheNotice: { fontSize: Typography.xs, color: Colors.warningDark, marginBottom: Spacing[2] },
  smsNotice: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.primaryDark, backgroundColor: Colors.primaryLight, borderRadius: Radius.md, padding: Spacing[2], marginBottom: Spacing[2] },
  modeToggleRow: { flexDirection: 'row', gap: Spacing[2], marginBottom: Spacing[2] },
  modeToggleBtn: { flex: 1, paddingVertical: Spacing[2], borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.gray200, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  modeToggleBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  modeToggleBtnDisabled: { backgroundColor: Colors.gray50, opacity: 0.7 },
  modeToggleLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.gray500 },
  modeToggleLabelActive: { color: Colors.primaryDark },
  modeToggleLabelDisabled: { color: Colors.gray300 },
  aiRationale: { fontSize: Typography.xs, color: Colors.gray500, fontStyle: 'italic', marginTop: 6, lineHeight: 16 },
  hintTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.primaryDark },
  hintBody: { fontSize: Typography.xs, color: Colors.primaryDark, marginTop: 2 },
  searchRow: { flexDirection: 'row', alignItems: 'flex-start' },
  emptyText: { fontSize: Typography.sm, color: Colors.gray400, textAlign: 'center', paddingVertical: Spacing[4] },
  patientResult: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[3], marginBottom: Spacing[2], ...Shadow.sm },
  resultTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  resultName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  resultMeta: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  resultCaseCount: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  linkedBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primaryLight, borderRadius: Radius.md, padding: Spacing[3], marginBottom: Spacing[3] },
  linkedText: { fontSize: Typography.sm, color: Colors.primaryDark, fontWeight: Typography.medium },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.successLight, borderRadius: Radius.md, padding: Spacing[3], marginBottom: Spacing[4] },
  successTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.successDark },
  successSub: { fontSize: Typography.xs, color: Colors.successDark, marginTop: 2 },
  actionCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[3], marginBottom: Spacing[2], borderWidth: 1, borderColor: Colors.border },
  actionCardRecommended: { borderColor: Colors.primary, borderWidth: 2, backgroundColor: Colors.primaryLight },
  actionIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  actionDesc: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: Spacing[3] },
  backLinkText: { fontSize: Typography.sm, color: Colors.gray400 },
  loadingText: { fontSize: Typography.sm, color: Colors.gray400 },
  facilityCard: { flexDirection: 'row', gap: Spacing[3], backgroundColor: Colors.white, borderWidth: 2, borderColor: Colors.border, borderRadius: Radius.lg, padding: Spacing[3], marginBottom: Spacing[2] },
  facilityCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  rankBadge: { width: 22, height: 22, borderRadius: Radius.full, backgroundColor: Colors.gray100, alignItems: 'center', justifyContent: 'center' },
  rankBadgeTop: { backgroundColor: Colors.primary },
  rankText: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.textSecondary },
  rankTextTop: { color: Colors.white },
  facilityName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  facilityMeta: { fontSize: Typography.xs, color: Colors.gray400 },
  facilityScore: { fontSize: Typography.xs, fontWeight: Typography.semibold, color: Colors.primaryDark },
  footerRow: { flexDirection: 'row', gap: Spacing[2], marginTop: Spacing[4], paddingTop: Spacing[3], borderTopWidth: 1, borderTopColor: Colors.border },
});
