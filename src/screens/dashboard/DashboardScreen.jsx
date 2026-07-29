import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { casesApi, referralsApi, patientsApi, consultationsApi, transportApi, getErrorMessage } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Input, Button, Spinner, Badge, ErrorBanner, StatCard, EmptyState } from '../../components/ui';
import { DangerSignList } from '../../components/ui/dangerSigns';
import VoiceEntryBar, { VoiceEntryTrigger } from '../../components/voice/VoiceEntryBar';
import useVoiceEntry from '../../hooks/useVoiceEntry';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

const STATUS_VARIANT = { pending: 'warning', active: 'info', assigned: 'info', completed: 'success', cancelled: 'danger',
  DRAFT: 'default', PENDING: 'warning', ACCEPTED: 'info', IN_TRANSIT: 'info', RECEIVED: 'success', COMPLETED: 'success', CANCELLED: 'danger', FAILED: 'danger' };
const timeAgo = (d) => {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};
const FOLLOWUPS_KEY = 'neomatcare_followups';

export default function DashboardScreen({ navigation }) {
  const { role } = useAuth();
  if (role === 'specialist') return <SpecialistDashboard navigation={navigation} />;
  if (role === 'driver') return <DriverDashboard navigation={navigation} />;
  if (role === 'facility_admin') return <FacilityAdminDashboard navigation={navigation} />;
  if (role === 'superadmin') return <SuperadminDashboard navigation={navigation} />;
  return <HealthWorkerDashboard navigation={navigation} />;
}

// ─── Health Worker ──────────────────────────────────────────────────────────────
function HealthWorkerDashboard({ navigation }) {
  const insets = useSafeAreaInsets();
  const [cases, setCases] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [patients, setPatients] = useState([]);
  const [followUps, setFollowUps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const stored = JSON.parse((await AsyncStorage.getItem(FOLLOWUPS_KEY)) || '[]');
      setFollowUps(stored.filter((f) => !f.completed));
      const [c, r, p] = await Promise.all([casesApi.list(), referralsApi.list(), patientsApi.list({ risk_level: 'high' })]);
      setCases(Array.isArray(c.data) ? c.data : (c.data.results || []));
      setReferrals(Array.isArray(r.data) ? r.data : (r.data.results || []));
      setPatients(Array.isArray(p.data) ? p.data : (p.data.results || []));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addFollowUp = async (patientName, patientId, note, dueDate) => {
    const task = { id: Date.now(), patientName, patientId, note, dueDate, completed: false, createdAt: new Date().toISOString() };
    const all = JSON.parse((await AsyncStorage.getItem(FOLLOWUPS_KEY)) || '[]');
    all.push(task);
    await AsyncStorage.setItem(FOLLOWUPS_KEY, JSON.stringify(all));
    setFollowUps((prev) => [...prev, task]);
  };
  const completeFollowUp = async (taskId) => {
    const all = JSON.parse((await AsyncStorage.getItem(FOLLOWUPS_KEY)) || '[]');
    const updated = all.map((f) => (f.id === taskId ? { ...f, completed: true } : f));
    await AsyncStorage.setItem(FOLLOWUPS_KEY, JSON.stringify(updated));
    setFollowUps((prev) => prev.filter((f) => f.id !== taskId));
  };

  if (loading) return <Spinner fullScreen />;

  const active = referrals.filter((r) => !['COMPLETED', 'CANCELLED', 'FAILED'].includes(r.status));
  const overdueCount = followUps.filter((f) => f.dueDate && new Date(f.dueDate) < new Date()).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: Spacing[4], paddingTop: insets.top + Spacing[16], paddingBottom: Spacing[10] }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.subtitle}>Your active cases and referrals</Text>
      <ErrorBanner message={error} onDismiss={() => setError('')} />

      <View style={styles.statsGrid}>
        <StatCard label="My Cases" value={cases.length} icon="clipboard-outline" />
        <StatCard label="Active Referrals" value={active.length} icon="swap-horizontal-outline" color={Colors.infoDark} />
        <StatCard label="High-Risk Patients" value={patients.length} icon="alert-circle-outline" color={Colors.warningDark} />
        <StatCard label="Follow-ups Due" value={followUps.length} icon="calendar-outline" color={overdueCount > 0 ? Colors.dangerDark : Colors.primary} />
      </View>

      <SectionCard title="Recent Cases" onViewAll={() => navigation.navigate('MenuTab', { screen: 'CasesTab' })}>
        {cases.length === 0 ? <Text style={styles.emptyText}>No cases yet</Text> : cases.slice(0, 5).map((c) => (
          <TouchableOpacity key={c.id} style={styles.row} onPress={() => navigation.navigate('MenuTab', { screen: 'CasesTab', params: { screen: 'CaseDetail', params: { id: c.id } } })}>
            <View style={styles.rowIcon}><Ionicons name="alert-circle" size={16} color={Colors.dangerDark} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{c.patient_name || 'Patient'} · {c.patient_age}y</Text>
              <DangerSignList signs={c.danger_signs} />
              <Text style={styles.rowMeta}>{timeAgo(c.created_at)}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </SectionCard>

      <SectionCard title="Active Referrals" onViewAll={() => navigation.navigate('MenuTab', { screen: 'Referrals' })}>
        {active.length === 0 ? <Text style={styles.emptyText}>No active referrals</Text> : active.slice(0, 5).map((r) => (
          <TouchableOpacity key={r.id} style={styles.row} onPress={() => navigation.navigate('MenuTab', { screen: 'Referrals', params: { screen: 'ReferralDetail', params: { id: r.id } } })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{r.receiving_facility_name}</Text>
              <Text style={styles.rowMeta}>From {r.referring_facility_name}</Text>
            </View>
            <Badge label={r.status.replace(/_/g, ' ')} variant={STATUS_VARIANT[r.status]} />
          </TouchableOpacity>
        ))}
      </SectionCard>

      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View>
            <Text style={styles.cardTitle}>📅 Follow-up Schedule</Text>
            <Text style={styles.cardSub}>Post-discharge check-ins and postnatal care tasks</Text>
          </View>
          <Button title={showForm ? 'Cancel' : '+ Add'} size="sm" variant="outline" onPress={() => setShowForm((v) => !v)} />
        </View>

        {showForm && <FollowUpForm patients={patients} onAdd={(...args) => { addFollowUp(...args); setShowForm(false); }} />}

        {followUps.length === 0 ? <Text style={styles.emptyText}>No pending follow-ups</Text> : followUps.map((task) => {
          const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
          return (
            <View key={task.id} style={styles.row}>
              <View style={[styles.rowIcon, isOverdue && { backgroundColor: Colors.dangerLight }]}>
                <Ionicons name="calendar" size={14} color={isOverdue ? Colors.dangerDark : Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={styles.rowTitle}>{task.patientName}</Text>
                  {isOverdue && <Badge label="Overdue" variant="danger" />}
                </View>
                {!!task.note && <Text style={styles.rowMeta}>{task.note}</Text>}
                {!!task.dueDate && <Text style={styles.rowMeta}>Due {new Date(task.dueDate).toLocaleDateString()}</Text>}
              </View>
              <TouchableOpacity onPress={() => completeFollowUp(task.id)}><Text style={styles.doneLink}>Done</Text></TouchableOpacity>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function FollowUpForm({ patients, onAdd }) {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState('');
  const voiceFields = [{ key: 'note', label: 'Follow-up Note', get: () => note, set: setNote }];
  const voiceEntry = useVoiceEntry(voiceFields);

  const handleAdd = () => {
    if (!name.trim()) return;
    const match = patients.find((p) => p.patient_name === name);
    onAdd(name, match?.id || null, note, dueDate);
    setName(''); setNote(''); setDueDate('');
  };

  return (
    <View style={styles.followUpForm}>
      <Input label="Patient Name" required value={name} onChangeText={setName} placeholder="Patient name…" />
      <Input label="Due Date" value={dueDate} onChangeText={setDueDate} placeholder="YYYY-MM-DD" />
      <VoiceEntryTrigger onPress={voiceEntry.start} count={voiceFields.length} />
      <Input label="Follow-up Note" value={note} onChangeText={setNote} placeholder="e.g. Postnatal check at 6 weeks, BP monitoring…" />
      <Button title="Schedule Follow-up" onPress={handleAdd} fullWidth disabled={!name.trim()} />
      <VoiceEntryBar voiceEntry={voiceEntry} />
    </View>
  );
}

// ─── Specialist ───────────────────────────────────────────────────────────────
function SpecialistDashboard({ navigation }) {
  const insets = useSafeAreaInsets();
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    setLoading(true);
    consultationsApi.queue()
      .then(({ data }) => setQueue(Array.isArray(data) ? data : (data.results || [])))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []));

  if (loading) return <Spinner fullScreen />;
  const pending = queue.filter((q) => q.status === 'pending');
  const inProgress = queue.filter((q) => q.status === 'active');

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: Spacing[4], paddingTop: insets.top + Spacing[16], paddingBottom: Spacing[10] }}>
      <Text style={styles.title}>Consultation Queue</Text>
      <Text style={styles.subtitle}>Incoming consultation requests</Text>
      <ErrorBanner message={error} onDismiss={() => setError('')} />

      <View style={styles.statsGrid}>
        <StatCard label="Pending" value={pending.length} icon="videocam-outline" color={Colors.warningDark} />
        <StatCard label="In Progress" value={inProgress.length} icon="videocam-outline" color={Colors.infoDark} />
        <StatCard label="Total Queue" value={queue.length} icon="videocam-outline" />
      </View>

      <SectionCard title="Active Requests">
        {queue.length === 0 ? <EmptyState icon="checkmark-circle-outline" title="Queue is clear" /> : queue.map((c) => (
          <TouchableOpacity key={c.id} style={styles.row} onPress={() => navigation.navigate('MenuTab', { screen: 'Consultations', params: { screen: 'ConsultationDetail', params: { id: c.id } } })}>
            <View style={[styles.rowIcon, { backgroundColor: '#f3e8ff' }]}><Ionicons name="videocam" size={16} color="#7c3aed" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Consultation request</Text>
              <Text style={styles.rowMeta}>{timeAgo(c.created_at)}</Text>
            </View>
            <Badge label={c.status} variant={STATUS_VARIANT[c.status]} />
          </TouchableOpacity>
        ))}
      </SectionCard>
    </ScrollView>
  );
}

// ─── Driver ───────────────────────────────────────────────────────────────────
function DriverDashboard({ navigation }) {
  const insets = useSafeAreaInsets();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    transportApi.requests.mine().then(({ data }) => setRequests(Array.isArray(data) ? data : (data.results || []))).finally(() => setLoading(false));
  }, []));

  if (loading) return <Spinner fullScreen />;
  const active = requests.filter((r) => !['completed', 'cancelled'].includes(r.status));
  const completed = requests.filter((r) => r.status === 'completed');

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: Spacing[4], paddingTop: insets.top + Spacing[16], paddingBottom: Spacing[10] }}>
      <Text style={styles.title}>My Dispatches</Text>
      <Text style={styles.subtitle}>Your transport assignments</Text>

      <View style={styles.statsGrid}>
        <StatCard label="Active" value={active.length} icon="car-outline" color={Colors.warningDark} />
        <StatCard label="Completed" value={completed.length} icon="car-outline" />
      </View>

      <SectionCard title="Active Assignments">
        {active.length === 0 ? <Text style={styles.emptyText}>No active assignments</Text> : active.map((r) => (
          <TouchableOpacity key={r.id} style={styles.row} onPress={() => navigation.navigate('MenuTab', { screen: 'Transport' })}>
            <View style={[styles.rowIcon, { backgroundColor: '#fffbeb' }]}><Ionicons name="car" size={16} color={Colors.warningDark} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{r.vehicle_registration || 'Vehicle TBD'}</Text>
              <Text style={styles.rowMeta} numberOfLines={1}>{r.notes || 'No notes'}</Text>
            </View>
            <Badge label={r.status} variant={STATUS_VARIANT[r.status]} />
          </TouchableOpacity>
        ))}
      </SectionCard>
    </ScrollView>
  );
}

// ─── Facility Admin ─────────────────────────────────────────────────────────────
function FacilityAdminDashboard({ navigation }) {
  const insets = useSafeAreaInsets();
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    referralsApi.list().then(({ data }) => setReferrals(Array.isArray(data) ? data : (data.results || []))).finally(() => setLoading(false));
  }, []));

  if (loading) return <Spinner fullScreen />;
  const incoming = referrals.filter((r) => ['PENDING', 'ACCEPTED'].includes(r.status));

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: Spacing[4], paddingTop: insets.top + Spacing[16], paddingBottom: Spacing[10] }}>
      <Text style={styles.title}>Facility Dashboard</Text>
      <Text style={styles.subtitle}>Incoming referrals and capacity</Text>

      <View style={styles.statsGrid}>
        <StatCard label="Incoming" value={incoming.length} icon="swap-horizontal-outline" color={Colors.warningDark} />
        <StatCard label="In Transit" value={referrals.filter((r) => r.status === 'IN_TRANSIT').length} icon="car-outline" color={Colors.infoDark} />
        <StatCard label="Completed" value={referrals.filter((r) => r.status === 'COMPLETED').length} icon="checkmark-circle-outline" />
        <StatCard label="Total" value={referrals.length} icon="swap-horizontal-outline" />
      </View>

      <SectionCard title="Pending Referrals" onViewAll={() => navigation.navigate('MenuTab', { screen: 'Referrals' })}>
        {incoming.length === 0 ? <Text style={styles.emptyText}>No pending referrals</Text> : incoming.slice(0, 8).map((r) => (
          <TouchableOpacity key={r.id} style={styles.row} onPress={() => navigation.navigate('MenuTab', { screen: 'Referrals', params: { screen: 'ReferralDetail', params: { id: r.id } } })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>From {r.referring_facility_name}</Text>
              <Text style={styles.rowMeta}>{timeAgo(r.created_at)}</Text>
            </View>
            <Badge label={r.status.replace(/_/g, ' ')} variant={STATUS_VARIANT[r.status]} />
          </TouchableOpacity>
        ))}
      </SectionCard>
    </ScrollView>
  );
}

// ─── Superadmin ─────────────────────────────────────────────────────────────────
function SuperadminDashboard({ navigation }) {
  const insets = useSafeAreaInsets();
  const [cases, setCases] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    Promise.all([casesApi.list(), referralsApi.list()])
      .then(([c, r]) => {
        setCases(Array.isArray(c.data) ? c.data : (c.data.results || []));
        setReferrals(Array.isArray(r.data) ? r.data : (r.data.results || []));
      })
      .finally(() => setLoading(false));
  }, []));

  if (loading) return <Spinner fullScreen />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: Spacing[4], paddingTop: insets.top + Spacing[16], paddingBottom: Spacing[10] }}>
      <Text style={styles.title}>System Overview</Text>
      <Text style={styles.subtitle}>Platform-wide activity</Text>

      <View style={styles.statsGrid}>
        <StatCard label="Total Cases" value={cases.length} icon="clipboard-outline" />
        <StatCard label="Total Referrals" value={referrals.length} icon="swap-horizontal-outline" color={Colors.infoDark} />
        <StatCard label="Active Referrals" value={referrals.filter((r) => !['COMPLETED', 'CANCELLED', 'FAILED'].includes(r.status)).length} icon="swap-horizontal-outline" color={Colors.warningDark} />
        <StatCard label="Completed" value={referrals.filter((r) => r.status === 'COMPLETED').length} icon="checkmark-circle-outline" />
      </View>

      <SectionCard title="Recent Cases" onViewAll={() => navigation.navigate('MenuTab', { screen: 'CasesTab' })}>
        {cases.slice(0, 6).map((c) => (
          <TouchableOpacity key={c.id} style={styles.row} onPress={() => navigation.navigate('MenuTab', { screen: 'CasesTab', params: { screen: 'CaseDetail', params: { id: c.id } } })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{c.referring_facility_name} · {c.patient_age}y</Text>
              <DangerSignList signs={c.danger_signs} />
            </View>
            <Text style={styles.rowMeta}>{timeAgo(c.created_at)}</Text>
          </TouchableOpacity>
        ))}
      </SectionCard>

      <SectionCard title="Recent Referrals" onViewAll={() => navigation.navigate('MenuTab', { screen: 'Referrals' })}>
        {referrals.slice(0, 6).map((r) => (
          <TouchableOpacity key={r.id} style={styles.row} onPress={() => navigation.navigate('MenuTab', { screen: 'Referrals', params: { screen: 'ReferralDetail', params: { id: r.id } } })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{r.referring_facility_name} → {r.receiving_facility_name}</Text>
              <Text style={styles.rowMeta}>{r.created_by_name}</Text>
            </View>
            <Badge label={r.status.replace(/_/g, ' ')} variant={STATUS_VARIANT[r.status]} />
          </TouchableOpacity>
        ))}
      </SectionCard>
    </ScrollView>
  );
}

// ─── Shared section wrapper ─────────────────────────────────────────────────────
function SectionCard({ title, onViewAll, children }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardTitle}>{title}</Text>
        {onViewAll && <TouchableOpacity onPress={onViewAll}><Text style={styles.viewAllLink}>View all</Text></TouchableOpacity>}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  title: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  subtitle: { fontSize: Typography.sm, color: Colors.gray400, marginTop: 2, marginBottom: Spacing[4] },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2], marginBottom: Spacing[3] },
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], marginBottom: Spacing[3], ...Shadow.sm },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing[2] },
  cardTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  cardSub: { fontSize: 10, color: Colors.gray400, marginTop: 1 },
  viewAllLink: { fontSize: Typography.xs, color: Colors.primaryDark, fontWeight: Typography.medium },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], paddingVertical: Spacing[2], borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  rowIcon: { width: 32, height: 32, borderRadius: Radius.md, backgroundColor: Colors.dangerLight, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  rowMeta: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  emptyText: { fontSize: Typography.sm, color: Colors.gray400, textAlign: 'center', paddingVertical: Spacing[4] },
  followUpForm: { backgroundColor: Colors.gray50, borderRadius: Radius.md, padding: Spacing[3], marginBottom: Spacing[3] },
  doneLink: { fontSize: Typography.xs, color: Colors.primaryDark, fontWeight: Typography.semibold },
});
