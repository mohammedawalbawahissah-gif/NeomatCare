import React, { useState, useEffect, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usersApi, facilitiesApi, getErrorMessage } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Input, Select, Button, Modal, Spinner, Badge, ErrorBanner, EmptyState, Avatar } from '../../components/ui';
import VoiceEntryBar, { VoiceEntryTrigger } from '../../components/voice/VoiceEntryBar';
import useVoiceEntry from '../../hooks/useVoiceEntry';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

const ROLE_LABELS = { health_worker: 'Health Worker', facility_admin: 'Facility Admin', specialist: 'Specialist', driver: 'Driver', superadmin: 'Superadmin' };
const ROLE_VARIANT = { health_worker: 'success', facility_admin: 'info', specialist: 'primary', driver: 'warning', superadmin: 'danger' };
const FACILITY_ROLES = ['health_worker', 'facility_admin'];
const timeAgo = (d) => {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

export default function UsersScreen() {
  const insets = useSafeAreaInsets();
  const { user: currentUser, isSuperadmin, isFacilityAdmin } = useAuth();
  const canManage = isSuperadmin || isFacilityAdmin;

  const [users, setUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [createModal, setCreateModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [deleteUser, setDeleteUser] = useState(null);

  useEffect(() => {
    if (isSuperadmin) facilitiesApi.list().then(({ data }) => setFacilities(Array.isArray(data) ? data : (data.results || []))).catch(() => {});
    usersApi.list().then(({ data }) => setAllUsers(Array.isArray(data) ? data : (data.results || []))).catch(() => {});
  }, [isSuperadmin]);

  const fetchUsers = useCallback(() => {
    setLoading(true); setError('');
    const params = {};
    if (search) params.search = search;
    if (roleFilter) params.role = roleFilter;
    usersApi.list(params)
      .then(({ data }) => setUsers(Array.isArray(data) ? data : (data.results || [])))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [search, roleFilter]);

  useEffect(() => { const t = setTimeout(fetchUsers, 350); return () => clearTimeout(t); }, [fetchUsers]);

  const handleSaved = (saved, isEdit) => {
    if (isEdit) {
      setUsers((prev) => prev.map((u) => (u.id === saved.id ? saved : u)));
      setAllUsers((prev) => prev.map((u) => (u.id === saved.id ? saved : u)));
      setEditUser(null);
    } else {
      setUsers((prev) => [saved, ...prev]);
      setAllUsers((prev) => [saved, ...prev]);
      setCreateModal(false);
    }
  };
  const handleDeleted = (id) => {
    setUsers((prev) => prev.filter((u) => u.id !== id));
    setAllUsers((prev) => prev.filter((u) => u.id !== id));
    setDeleteUser(null);
  };

  const [approvingId, setApprovingId] = useState(null);
  const handleApprove = async (u) => {
    setApprovingId(u.id);
    try {
      const { data } = await usersApi.approve(u.id);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? data : x)));
      setAllUsers((prev) => prev.map((x) => (x.id === u.id ? data : x)));
    } catch (err) {
      setError(getErrorMessage(err) || 'Could not approve this user. Please try again.');
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing[5] }]}>
        <View>
          <Text style={styles.headerTitle}>Users</Text>
          <Text style={styles.headerSub}>{isFacilityAdmin ? 'Users at your facility' : 'All platform users'}</Text>
        </View>
        {canManage && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setCreateModal(true)}>
            <Ionicons name="add" size={22} color={Colors.white} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing[4] }}>
        <Input value={search} onChangeText={setSearch} placeholder="Search by name or email…" icon="search-outline" />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing[3] }}>
          <View style={{ flexDirection: 'row', gap: Spacing[2] }}>
            {Object.entries(ROLE_LABELS).map(([role, label]) => (
              <TouchableOpacity
                key={role} style={[styles.roleChip, roleFilter === role && styles.roleChipActive]}
                onPress={() => setRoleFilter((r) => (r === role ? '' : role))}
              >
                <Text style={styles.roleChipCount}>{allUsers.filter((u) => u.role === role).length}</Text>
                <Text style={styles.roleChipLabel}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <ErrorBanner message={error} onDismiss={() => setError('')} />

        {loading ? <Spinner /> : users.length === 0 ? (
          <EmptyState icon="people-outline" title="No users found" message="Try adjusting your search or filters" />
        ) : users.map((u) => (
          <View key={u.id} style={styles.card}>
            <Avatar name={u.name} size={40} />
            <View style={{ flex: 1 }}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardName}>{u.name}</Text>
                <Badge label={ROLE_LABELS[u.role] || u.role} variant={ROLE_VARIANT[u.role]} />
                {!u.is_active && <Badge label="Inactive" variant="default" />}
                {u.role !== 'patient' && u.role !== 'superadmin' && !u.is_approved && (
                  <Badge label="Pending Approval" variant="warning" />
                )}
              </View>
              <Text style={styles.cardMeta}>✉ {u.email}</Text>
              {!!u.facility_name && <Text style={styles.cardMeta}>🏥 {u.facility_name}</Text>}
              <Text style={styles.cardMetaFaded}>{timeAgo(u.created_at)}</Text>
            </View>
            {canManage && (
              <View style={{ gap: 6 }}>
                {u.role !== 'patient' && u.role !== 'superadmin' && !u.is_approved && (
                  <TouchableOpacity
                    style={[styles.iconBtn, styles.iconBtnWarning]}
                    onPress={() => handleApprove(u)}
                    disabled={approvingId === u.id}
                  >
                    <Ionicons name="checkmark-circle-outline" size={15} color={Colors.warningDark} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.iconBtn} onPress={() => setEditUser(u)}>
                  <Ionicons name="create-outline" size={15} color={Colors.successDark} />
                </TouchableOpacity>
                {isSuperadmin && (
                  <TouchableOpacity style={[styles.iconBtn, styles.iconBtnDanger]} onPress={() => setDeleteUser(u)}>
                    <Ionicons name="trash-outline" size={15} color={Colors.dangerDark} />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      <UserFormModal visible={createModal} onClose={() => setCreateModal(false)} facilities={facilities} currentUser={currentUser} onSaved={(u) => handleSaved(u, false)} />
      <UserFormModal visible={!!editUser} onClose={() => setEditUser(null)} user={editUser} facilities={facilities} currentUser={currentUser} onSaved={(u) => handleSaved(u, true)} />
      <DeleteUserModal visible={!!deleteUser} onClose={() => setDeleteUser(null)} user={deleteUser} onDeleted={handleDeleted} />
    </View>
  );
}

function UserFormModal({ visible, onClose, user, facilities, currentUser, onSaved }) {
  const isEdit = !!user;
  const isFacilityAdminCreator = currentUser?.role === 'facility_admin';
  const EMPTY = { name: '', email: '', role: 'health_worker', facility: '', password: '', password2: '', is_active: true, phone_number: '', license_number: '' };
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setError('');
    if (user) {
      setForm({ ...EMPTY, ...user, password: '', password2: '', facility: user.facility || '' });
    } else {
      setForm({ ...EMPTY, facility: isFacilityAdminCreator ? (currentUser.facility || '') : '' });
    }
  }, [visible, user]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const voiceFields = [
    { key: 'name', label: 'Full Name', get: () => form.name, set: set('name') },
    ...(form.role === 'driver' ? [
      { key: 'phone_number', label: 'Phone Number', get: () => form.phone_number, set: set('phone_number') },
      { key: 'license_number', label: 'License Number', get: () => form.license_number, set: set('license_number') },
    ] : []),
  ];
  const voiceEntry = useVoiceEntry(voiceFields);
  const needsFacility = FACILITY_ROLES.includes(form.role);
  const availableRoles = isFacilityAdminCreator
    ? Object.entries(ROLE_LABELS).filter(([v]) => v !== 'superadmin')
    : Object.entries(ROLE_LABELS);

  const handleSubmit = async () => {
    setError('');
    if (!isEdit && form.password !== form.password2) { setError('Passwords do not match.'); return; }
    if (!isEdit && form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), email: form.email.trim(), role: form.role, is_active: form.is_active,
        ...(needsFacility && form.facility && { facility: form.facility }),
        ...(form.role === 'driver' && form.phone_number && { phone_number: form.phone_number.trim() }),
        ...(form.role === 'driver' && form.license_number && { license_number: form.license_number.trim() }),
      };
      if (!isEdit) { payload.password = form.password; payload.password2 = form.password2; }
      const { data } = isEdit ? await usersApi.update(user.id, payload) : await usersApi.create(payload);
      onSaved(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} onClose={onClose} title={isEdit ? 'Edit User' : 'Create New User'} size="lg">
      <ScrollView style={{ maxHeight: 480 }} keyboardShouldPersistTaps="handled">
        <ErrorBanner message={error} onDismiss={() => setError('')} />
        <VoiceEntryTrigger onPress={voiceEntry.start} count={voiceFields.length} />
        <Input label="Full Name" required value={form.name} onChangeText={set('name')} placeholder="Full name" />
        <Input label="Email" required value={form.email} onChangeText={set('email')} placeholder="user@facility.gh" keyboardType="email-address" autoCapitalize="none" />
        <Select label="Role" required value={form.role} onValueChange={set('role')} options={availableRoles.map(([v, l]) => ({ value: v, label: l }))} />
        <Select label="Status" value={form.is_active} onValueChange={set('is_active')} options={[{ value: true, label: 'Active' }, { value: false, label: 'Inactive' }]} />
        {needsFacility && (
          isFacilityAdminCreator ? (
            <Input label="Facility" value={currentUser.facility_name || 'Your facility'} editable={false} />
          ) : (
            <Select label="Facility" required value={form.facility} onValueChange={set('facility')} placeholder="— Select facility —" options={facilities.map((f) => ({ value: f.id, label: f.name }))} />
          )
        )}
        {form.role === 'driver' && (
          <>
            <Input label="Phone Number" required={!isEdit} value={form.phone_number} onChangeText={set('phone_number')} placeholder="+233..." keyboardType="phone-pad" icon="call-outline" />
            <Input label="License Number (optional)" value={form.license_number} onChangeText={set('license_number')} placeholder="e.g. GH-1234-2020" icon="card-outline" />
          </>
        )}
        {!isEdit && (
          <>
            <Input label="Password" required value={form.password} onChangeText={set('password')} placeholder="Min. 8 characters" secureTextEntry />
            <Input label="Confirm Password" required value={form.password2} onChangeText={set('password2')} placeholder="Repeat password" secureTextEntry />
          </>
        )}
      </ScrollView>
      <View style={styles.modalActions}>
        <Button title="Cancel" variant="outline" onPress={onClose} style={{ flex: 1 }} />
        <Button title={isEdit ? 'Save Changes' : 'Create User'} onPress={handleSubmit} loading={saving} style={{ flex: 2 }} />
      </View>
      <VoiceEntryBar voiceEntry={voiceEntry} />
    </Modal>
  );
}

function DeleteUserModal({ visible, onClose, user, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [hardDelete, setHardDelete] = useState(false);

  const handleDelete = async () => {
    setDeleting(true); setError('');
    try {
      await usersApi.delete(user.id, hardDelete ? { hard: true } : undefined);
      onDeleted(user.id);
    } catch (err) {
      setError(getErrorMessage(err) || `Failed to ${hardDelete ? 'delete' : 'deactivate'} user. Please try again.`);
      setDeleting(false);
    }
  };

  if (!user) return null;
  return (
    <Modal visible={visible} onClose={onClose} title={hardDelete ? `Permanently delete ${user.name}?` : `Deactivate ${user.name}?`}>
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      {hardDelete ? (
        <Text style={styles.deleteBody}>This removes the account row entirely. It fails safely if they created any emergency cases or triage notes — those clinical records can never be deleted out from under a case history.</Text>
      ) : (
        <Text style={styles.deleteBody}>The user will lose access immediately. Their clinical records will be preserved.</Text>
      )}
      <Text style={styles.deleteBodySmall}>{hardDelete ? 'This cannot be undone.' : 'This can be undone by editing the user and setting their status back to Active.'}</Text>

      <TouchableOpacity style={styles.hardDeleteRow} onPress={() => setHardDelete((v) => !v)}>
        <Ionicons name={hardDelete ? 'checkbox' : 'square-outline'} size={18} color={Colors.dangerDark} />
        <Text style={styles.hardDeleteLabel}>Permanently delete instead of deactivating</Text>
      </TouchableOpacity>

      <View style={styles.modalActions}>
        <Button title="Cancel" variant="outline" onPress={onClose} style={{ flex: 1 }} />
        <Button title={hardDelete ? 'Yes, Permanently Delete' : 'Yes, Deactivate'} variant="danger" onPress={handleDelete} loading={deleting} style={{ flex: 1 }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing[4], paddingTop: Spacing[5], paddingBottom: Spacing[2] },
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  addBtn: { width: 36, height: 36, borderRadius: Radius.full, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: 52, ...Shadow.sm },
  roleChip: { alignItems: 'center', backgroundColor: Colors.white, borderRadius: Radius.md, paddingVertical: 8, paddingHorizontal: 12, ...Shadow.sm },
  roleChipActive: { borderWidth: 2, borderColor: Colors.primary },
  roleChipCount: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  roleChipLabel: { fontSize: 10, color: Colors.gray400, marginTop: 2 },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3], backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[3], marginBottom: Spacing[2], ...Shadow.sm },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  cardName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  cardMeta: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  cardMetaFaded: { fontSize: 10, color: Colors.gray300, marginTop: 2 },
  iconBtn: { width: 28, height: 28, borderRadius: Radius.sm, backgroundColor: Colors.successLight, alignItems: 'center', justifyContent: 'center' },
  iconBtnDanger: { backgroundColor: Colors.dangerLight },
  iconBtnWarning: { backgroundColor: Colors.warningLight },
  deleteBody: { fontSize: Typography.sm, color: Colors.textSecondary },
  deleteBodySmall: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 4, marginBottom: Spacing[2] },
  hardDeleteRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing[2] },
  hardDeleteLabel: { fontSize: Typography.xs, color: Colors.dangerDark, flex: 1 },
  modalActions: { flexDirection: 'row', gap: Spacing[2], marginTop: Spacing[3] },
});
