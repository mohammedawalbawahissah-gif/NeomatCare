import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { transportApi, usersApi, getErrorMessage } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Input, Select, Button, Modal, Spinner, Badge, ErrorBanner, EmptyState } from '../../components/ui';
import VoiceEntryBar, { VoiceEntryTrigger } from '../../components/voice/VoiceEntryBar';
import useVoiceEntry from '../../hooks/useVoiceEntry';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

const TYPE_ICON = { ambulance: '🚑', car: '🚗', motorcycle: '🏍️', tricycle: '🛺', truck: '🚛', other: '🚐' };
const TYPE_OPTIONS = [
  { value: 'ambulance', label: 'Ambulance' }, { value: 'car', label: 'Car (Uber/Bolt/Yango)' },
  { value: 'motorcycle', label: 'Motorcycle' }, { value: 'tricycle', label: 'Tricycle (Yellow-Yellow/MotorKing)' },
  { value: 'truck', label: 'Truck' }, { value: 'other', label: 'Other' },
];
const VEHICLE_STATUS_OPTIONS = [
  { value: 'available', label: 'Available' }, { value: 'in_use', label: 'In Use' },
  { value: 'maintenance', label: 'Under Maintenance' }, { value: 'inactive', label: 'Inactive' },
];
const VEHICLE_STATUS_VARIANT = { available: 'success', in_use: 'info', maintenance: 'warning', inactive: 'default' };
const REQUEST_STATUS_VARIANT = { pending: 'warning', assigned: 'info', completed: 'success', cancelled: 'danger' };
const REQUEST_TRANSITIONS = {
  pending:  [{ v: 'assigned', l: 'Mark Assigned' }, { v: 'cancelled', l: 'Cancel' }],
  assigned: [{ v: 'completed', l: 'Mark Completed' }, { v: 'cancelled', l: 'Cancel' }],
};
const timeAgo = (d) => {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};
const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export default function TransportScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isFacilityAdmin, isSuperadmin } = useAuth();
  const canManage = isFacilityAdmin || isSuperadmin;

  const [tab, setTab] = useState('fleet'); // 'fleet' | 'active' | 'history'
  const [fleet, setFleet] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [vehicleModal, setVehicleModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const [{ data: v }, { data: r }] = await Promise.all([transportApi.vehicles.list(), transportApi.requests.list()]);
      setFleet(Array.isArray(v) ? v : (v.results || []));
      setRequests(Array.isArray(r) ? r : (r.results || []));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const active = requests.filter((r) => !['completed', 'cancelled'].includes(r.status));
  const done   = requests.filter((r) => r.status === 'completed');

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing[5] }]}>
        <View>
          <Text style={styles.headerTitle}>Transport</Text>
          <Text style={styles.headerSub}>{fleet.length} vehicle{fleet.length !== 1 ? 's' : ''} · {active.length} active</Text>
        </View>
        {canManage && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setVehicleModal(true)}>
            <Ionicons name="add" size={22} color={Colors.white} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.tabBar}>
        {[['fleet', `Fleet (${fleet.length})`], ['active', `Active (${active.length})`], ['history', `History (${done.length})`]].map(([v, l]) => (
          <TouchableOpacity key={v} onPress={() => setTab(v)} style={[styles.tabBtn, tab === v && styles.tabBtnActive]}>
            <Text style={[styles.tabBtnText, tab === v && styles.tabBtnTextActive]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {loading ? <Spinner fullScreen /> : (
        <ScrollView contentContainerStyle={{ padding: Spacing[4] }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}>
          {tab === 'fleet' && (
            fleet.length === 0 ? (
              <EmptyState icon="car-outline" title="No vehicles registered" message="Register your first vehicle to start dispatching"
                action={canManage ? { label: 'Register Vehicle', onPress: () => setVehicleModal(true) } : null} />
            ) : fleet.map((v) => (
              <View key={v.id} style={styles.vehicleCard}>
                <View style={styles.vehicleHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vehicleReg}>{TYPE_ICON[v.vehicle_type] || '🚗'}  {v.registration}</Text>
                    <Text style={styles.vehicleMeta}>
                      {v.vehicle_type?.replace(/_/g, ' ')}{v.make ? ` · ${v.make}` : ''}{v.model ? ` ${v.model}` : ''}{v.year ? ` (${v.year})` : ''}
                    </Text>
                  </View>
                  <Badge label={v.status.replace(/_/g, ' ')} variant={VEHICLE_STATUS_VARIANT[v.status]} />
                </View>
                {!!v.driver_name && (
                  <View style={styles.driverRow}>
                    <Text style={styles.driverText}>👤 {v.driver_name}</Text>
                    {!!v.driver_phone && (
                      <TouchableOpacity onPress={() => Linking.openURL(`tel:${v.driver_phone}`)}>
                        <Text style={styles.driverPhoneLink}>📞 {v.driver_phone}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                {!!v.notes && <Text style={styles.vehicleNotes}>{v.notes}</Text>}
                {canManage && (
                  <View style={styles.vehicleActions}>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => setEditTarget(v)}>
                      <Ionicons name="create-outline" size={16} color={Colors.successDark} />
                      <Text style={styles.iconBtnText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.iconBtn, styles.iconBtnDanger]} onPress={() => setDeleteTarget(v)}>
                      <Ionicons name="trash-outline" size={16} color={Colors.dangerDark} />
                      <Text style={[styles.iconBtnText, { color: Colors.dangerDark }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))
          )}

          {tab === 'active' && (
            active.length === 0 ? (
              <EmptyState icon="checkmark-circle-outline" title="No active transport requests" message="Requests are created from a referral or emergency case" />
            ) : active.map((r) => (
              <RequestRow key={r.id} r={r} onUpdate={() => setStatusTarget(r)} />
            ))
          )}

          {tab === 'history' && (
            done.length === 0 ? (
              <EmptyState icon="time-outline" title="No completed requests yet" />
            ) : done.map((r) => (
              <View key={r.id} style={styles.requestRow}>
                <View style={styles.requestIcon}><Text style={{ fontSize: 18 }}>🚑</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.requestReg}>{r.vehicle_registration || 'No vehicle'}</Text>
                  <Text style={styles.requestMeta}>{fmtDate(r.updated_at)}</Text>
                </View>
                <Badge label={r.status} variant={REQUEST_STATUS_VARIANT[r.status]} />
              </View>
            ))
          )}
        </ScrollView>
      )}

      <VehicleFormModal
        visible={vehicleModal} onClose={() => setVehicleModal(false)}
        onSaved={(v) => { setFleet((prev) => [v, ...prev]); setVehicleModal(false); }}
      />
      <VehicleFormModal
        visible={!!editTarget} onClose={() => setEditTarget(null)} vehicle={editTarget}
        onSaved={(v) => { setFleet((prev) => prev.map((x) => (x.id === v.id ? v : x))); setEditTarget(null); }}
      />
      <DeleteVehicleModal
        visible={!!deleteTarget} onClose={() => setDeleteTarget(null)} vehicle={deleteTarget}
        onDeleted={(id) => { setFleet((prev) => prev.filter((x) => x.id !== id)); setDeleteTarget(null); }}
      />
      <RequestStatusModal
        visible={!!statusTarget} onClose={() => setStatusTarget(null)} request={statusTarget}
        onUpdated={(u) => { setRequests((prev) => prev.map((x) => (x.id === u.id ? u : x))); setStatusTarget(null); }}
      />
    </View>
  );
}

function RequestRow({ r, onUpdate }) {
  return (
    <View style={styles.requestRow}>
      <View style={styles.requestIcon}><Text style={{ fontSize: 18 }}>🚑</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.requestReg}>{r.vehicle_registration || 'No vehicle assigned'}</Text>
        <Text style={styles.requestMeta}>{r.requested_by_name || 'Unknown'} · {timeAgo(r.created_at)}</Text>
        {!!r.notes && <Text style={styles.requestNotes}>{r.notes}</Text>}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Badge label={r.status} variant={REQUEST_STATUS_VARIANT[r.status]} />
        {!['completed', 'cancelled'].includes(r.status) && (
          <Button title="Update" size="sm" variant="outline" onPress={onUpdate} />
        )}
      </View>
    </View>
  );
}

// ─── Register / Edit Vehicle modal ──────────────────────────────────────────────
// "Assign Driver" lists role=driver USER accounts (not Driver-model rows) —
// the backend's VehicleViewSet._resolve_driver() accepts a user id and
// auto-creates/matches the corresponding Driver record. This matches web exactly.
function VehicleFormModal({ visible, onClose, vehicle, onSaved }) {
  const isEdit = !!vehicle;
  const INITIAL = { registration: '', vehicle_type: 'ambulance', make: '', model: '', year: '', status: 'available', driver: '', notes: '' };
  const [form, setForm] = useState(INITIAL);
  const [driverUsers, setDriverUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setForm(vehicle ? { ...INITIAL, ...vehicle, driver: vehicle.driver || '', year: vehicle.year ? String(vehicle.year) : '' } : INITIAL);
    setError('');
    usersApi.list({ role: 'driver' }).then(({ data }) => setDriverUsers(Array.isArray(data) ? data : (data.results || []))).catch(() => {});
  }, [visible, vehicle]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const voiceFields = [
    { key: 'registration', label: 'Registration Number', get: () => form.registration, set: set('registration') },
    { key: 'make', label: 'Make', get: () => form.make, set: set('make') },
    { key: 'model', label: 'Model', get: () => form.model, set: set('model') },
    { key: 'notes', label: 'Notes', get: () => form.notes, set: set('notes') },
  ];
  const voiceEntry = useVoiceEntry(voiceFields);

  const handleSubmit = async () => {
    if (!form.registration.trim()) { setError('Registration number is required.'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        registration: form.registration, vehicle_type: form.vehicle_type, status: form.status,
        ...(form.make && { make: form.make }), ...(form.model && { model: form.model }),
        ...(form.year && { year: Number(form.year) }),
        ...(form.driver && { driver: form.driver }),
        ...(form.notes && { notes: form.notes }),
      };
      const { data } = isEdit ? await transportApi.vehicles.update(vehicle.id, payload) : await transportApi.vehicles.create(payload);
      onSaved(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} onClose={onClose} title={isEdit ? 'Edit Vehicle' : 'Register Vehicle'} size="lg">
      <ScrollView style={{ maxHeight: 480 }} keyboardShouldPersistTaps="handled">
        <ErrorBanner message={error} onDismiss={() => setError('')} />
        <VoiceEntryTrigger onPress={voiceEntry.start} count={voiceFields.length} />
        <Input label="Registration Number" required value={form.registration} onChangeText={set('registration')} placeholder="e.g. GR-1234-21" />
        <Select label="Vehicle Type" required value={form.vehicle_type} onValueChange={set('vehicle_type')} options={TYPE_OPTIONS} />
        <Select label="Status" value={form.status} onValueChange={set('status')} options={VEHICLE_STATUS_OPTIONS} />
        <Input label="Make" value={form.make} onChangeText={set('make')} placeholder="e.g. Toyota" />
        <Input label="Model" value={form.model} onChangeText={set('model')} placeholder="e.g. Land Cruiser" />
        <Input label="Year" value={form.year} onChangeText={set('year')} placeholder="e.g. 2020" keyboardType="number-pad" />
        <Select
          label="Assign Driver (optional)" value={form.driver} onValueChange={set('driver')}
          placeholder="— No driver assigned —"
          options={[{ value: '', label: '— No driver assigned —' }, ...driverUsers.map((u) => ({ value: u.id, label: `${u.name}${u.email ? ` · ${u.email}` : ''}` }))]}
        />
        {driverUsers.length === 0 && <Text style={styles.hintText}>No driver accounts found. Register a user with role: Driver first.</Text>}
        <Input label="Notes" value={form.notes} onChangeText={set('notes')} multiline numberOfLines={2} placeholder="Any additional notes…" />
      </ScrollView>
      <View style={styles.modalActions}>
        <Button title="Cancel" variant="outline" onPress={onClose} style={{ flex: 1 }} />
        <Button title={isEdit ? 'Save Changes' : 'Register Vehicle'} onPress={handleSubmit} loading={saving} style={{ flex: 2 }} />
      </View>
      <VoiceEntryBar voiceEntry={voiceEntry} />
    </Modal>
  );
}

function DeleteVehicleModal({ visible, onClose, vehicle, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setDeleting(true); setError('');
    try {
      await transportApi.vehicles.delete(vehicle.id);
      onDeleted(vehicle.id);
    } catch {
      setError('Failed to delete vehicle. Please try again.');
      setDeleting(false);
    }
  };

  if (!vehicle) return null;
  return (
    <Modal visible={visible} onClose={onClose} title="Delete Vehicle?">
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <Text style={styles.deleteBody}><Text style={{ fontWeight: Typography.bold }}>{vehicle.registration}</Text> will be permanently removed from the fleet. This cannot be undone.</Text>
      <View style={styles.modalActions}>
        <Button title="Cancel" variant="outline" onPress={onClose} style={{ flex: 1 }} />
        <Button title="Delete Vehicle" variant="danger" icon="trash-outline" onPress={handleDelete} loading={deleting} style={{ flex: 2 }} />
      </View>
    </Modal>
  );
}

// ─── Transport Request status modal — shared with the driver "My Dispatches" screen ─
export function RequestStatusModal({ visible, onClose, request, onUpdated }) {
  const [newStatus, setNewStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Hook must run unconditionally on every render, so it's declared before
  // the `if (!request) return null` guard below.
  const voiceFields = [{ key: 'notes', label: 'Notes', get: () => notes, set: setNotes }];
  const voiceEntry = useVoiceEntry(voiceFields);

  const options = REQUEST_TRANSITIONS[request?.status] || [];

  useEffect(() => { if (visible) { setNewStatus(''); setNotes(''); setError(''); } }, [visible]);

  const handleSubmit = async () => {
    if (!newStatus) return;
    setSaving(true); setError('');
    try {
      const payload = { status: newStatus };
      if (notes) payload.notes = notes;
      const { data } = await transportApi.requests.updateStatus(request.id, payload);
      onUpdated(data);
    } catch {
      setError('Failed to update status.');
    } finally { setSaving(false); }
  };

  if (!request) return null;
  return (
    <Modal visible={visible} onClose={onClose} title="Update Transport Request">
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <Select label="Action" required value={newStatus} onValueChange={setNewStatus} placeholder="— Select —" options={options.map((o) => ({ value: o.v, label: o.l }))} />
      {options.length === 0 && <Text style={styles.hintText}>No transitions available for status: {request.status}</Text>}
      <VoiceEntryTrigger onPress={voiceEntry.start} count={voiceFields.length} />
      <Input label="Notes" value={notes} onChangeText={setNotes} multiline numberOfLines={2} placeholder="Any notes for this update…" />
      <View style={styles.modalActions}>
        <Button title="Cancel" variant="outline" onPress={onClose} style={{ flex: 1 }} />
        <Button title="Update" onPress={handleSubmit} loading={saving} disabled={!newStatus} style={{ flex: 1 }} />
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
  vehicleCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], marginBottom: Spacing[3], ...Shadow.sm },
  vehicleHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  vehicleReg: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  vehicleMeta: { fontSize: Typography.xs, color: Colors.gray400, textTransform: 'capitalize', marginTop: 2 },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], marginTop: Spacing[2] },
  driverText: { fontSize: Typography.xs, color: Colors.textSecondary },
  driverPhoneLink: { fontSize: Typography.xs, color: Colors.primaryDark, fontWeight: Typography.medium },
  vehicleNotes: { fontSize: Typography.xs, color: Colors.gray400, fontStyle: 'italic', marginTop: Spacing[2] },
  vehicleActions: { flexDirection: 'row', gap: Spacing[2], marginTop: Spacing[3], paddingTop: Spacing[3], borderTopWidth: 1, borderTopColor: Colors.gray100 },
  iconBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.sm, backgroundColor: Colors.successLight },
  iconBtnDanger: { backgroundColor: Colors.dangerLight },
  iconBtnText: { fontSize: Typography.xs, fontWeight: Typography.medium, color: Colors.successDark },
  requestRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[3], marginBottom: Spacing[2], ...Shadow.sm },
  requestIcon: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: '#fffbeb', alignItems: 'center', justifyContent: 'center' },
  requestReg: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  requestMeta: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  requestNotes: { fontSize: Typography.xs, color: Colors.gray400, fontStyle: 'italic', marginTop: 2 },
  hintText: { fontSize: 11, color: Colors.gray400, marginTop: -Spacing[2], marginBottom: Spacing[2] },
  deleteBody: { fontSize: Typography.sm, color: Colors.textSecondary, marginBottom: Spacing[2] },
  modalActions: { flexDirection: 'row', gap: Spacing[2], marginTop: Spacing[3] },
});
