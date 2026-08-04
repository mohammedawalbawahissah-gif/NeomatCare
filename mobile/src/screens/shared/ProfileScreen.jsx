import React, { useState, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { authApi, getErrorMessage } from '../../api/client';
import { Input, Button, Card, Badge, Avatar } from '../../components/ui';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

const ROLE_LABELS = { health_worker: 'Health Worker', facility_admin: 'Facility Admin', specialist: 'Specialist', driver: 'Driver', superadmin: 'Superadmin', patient: 'Patient' };
const ROLE_VARIANT = { health_worker: 'success', facility_admin: 'info', specialist: 'primary', driver: 'warning', superadmin: 'danger', patient: 'info' };

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, updateUser, logout } = useAuth();
  const [profile, setProfile] = useState({ name: '', email: '' });
  const [dirty, setDirty] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const [passwords, setPasswords] = useState({ current: '', new1: '', new2: '' });
  const [savingPw, setSavingPw] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const [toast, setToast] = useState(null);

  useEffect(() => { if (user) setProfile({ name: user.name || '', email: user.email || '' }); }, [user]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleProfileChange = (k) => (v) => { setProfile((p) => ({ ...p, [k]: v })); setDirty(true); };

  const handleSaveProfile = async () => {
    if (!profile.name.trim()) return;
    setSavingProfile(true);
    try {
      const { data } = await authApi.updateMe({ name: profile.name.trim(), email: profile.email.trim() });
      await updateUser(data);
      setDirty(false);
      showToast('Profile updated successfully');
    } catch (err) {
      showToast(getErrorMessage(err) || 'Failed to update profile.', 'error');
    } finally { setSavingProfile(false); }
  };

  const handleChangePassword = async () => {
    if (passwords.new1 !== passwords.new2) { showToast('New passwords do not match.', 'error'); return; }
    if (passwords.new1.length < 8) { showToast('Password must be at least 8 characters.', 'error'); return; }
    setSavingPw(true);
    try {
      await authApi.changePassword({ current_password: passwords.current, new_password: passwords.new1, new_password2: passwords.new2 });
      setPasswords({ current: '', new1: '', new2: '' });
      showToast('Password changed successfully');
    } catch (err) {
      showToast(getErrorMessage(err) || 'Failed to change password.', 'error');
    } finally { setSavingPw(false); }
  };

  if (!user) return null;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: Spacing[4], paddingTop: insets.top + Spacing[16], paddingBottom: Spacing[10] }} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>My Profile</Text>
        <Text style={styles.subtitle}>Manage your account information and password</Text>

        {!!toast && (
          <View style={[styles.toast, toast.type === 'error' && styles.toastError]}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.white} />
            <Text style={styles.toastText}>{toast.message}</Text>
          </View>
        )}

        <View style={styles.avatarCard}>
          <Avatar name={user.name} size={64} />
          <View style={{ flex: 1 }}>
            <Text style={styles.avatarName}>{user.name}</Text>
            <Text style={styles.avatarEmail}>{user.email}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <Badge label={ROLE_LABELS[user.role] || user.role} variant={ROLE_VARIANT[user.role]} />
              {!!user.facility_name && <Badge label={`🏥 ${user.facility_name}`} variant="default" />}
            </View>
          </View>
        </View>

        <Card>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: Colors.successLight }]}><Ionicons name="person" size={16} color={Colors.successDark} /></View>
            <View>
              <Text style={styles.sectionTitle}>Personal Information</Text>
              <Text style={styles.sectionSub}>Update your name and email address</Text>
            </View>
          </View>

          <Input label="Full Name" value={profile.name} onChangeText={handleProfileChange('name')} icon="person-outline" placeholder="Your full name" />
          <Input label="Email Address" value={profile.email} onChangeText={handleProfileChange('email')} icon="mail-outline" placeholder="your@email.com" keyboardType="email-address" autoCapitalize="none" />
          <Input label="Role" value={ROLE_LABELS[user.role] || user.role} editable={false} icon="shield-outline" />
          <Text style={styles.helperText}>Role can only be changed by an administrator</Text>

          <Button title="Save Changes" icon="save-outline" onPress={handleSaveProfile} loading={savingProfile} disabled={!dirty} fullWidth />
        </Card>

        <Card>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: '#fff7ed' }]}><Ionicons name="key" size={16} color="#ea580c" /></View>
            <View>
              <Text style={styles.sectionTitle}>Change Password</Text>
              <Text style={styles.sectionSub}>Choose a strong password with at least 8 characters</Text>
            </View>
          </View>

          <Input label="Current Password" required value={passwords.current} onChangeText={(v) => setPasswords((p) => ({ ...p, current: v }))} secureTextEntry={!showPw} icon="key-outline" placeholder="Enter current password" />
          <Input label="New Password" required value={passwords.new1} onChangeText={(v) => setPasswords((p) => ({ ...p, new1: v }))} secureTextEntry={!showPw} icon="key-outline" placeholder="Min. 8 characters" />
          <Input label="Confirm New Password" required value={passwords.new2} onChangeText={(v) => setPasswords((p) => ({ ...p, new2: v }))} secureTextEntry={!showPw} icon="key-outline" placeholder="Repeat new password" />
          <TouchableOpacity onPress={() => setShowPw((v) => !v)} style={styles.showPwRow}>
            <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={14} color={Colors.gray400} />
            <Text style={styles.showPwText}>{showPw ? 'Hide' : 'Show'} passwords</Text>
          </TouchableOpacity>

          <Button
            title="Update Password" icon="key-outline" variant="secondary" onPress={handleChangePassword} loading={savingPw}
            disabled={!passwords.current || !passwords.new1 || !passwords.new2} fullWidth
          />
        </Card>

        <Button title="Log Out" icon="log-out-outline" variant="outline" onPress={logout} fullWidth style={{ marginTop: Spacing[2] }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  title: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary },
  subtitle: { fontSize: Typography.sm, color: Colors.gray400, marginTop: 2, marginBottom: Spacing[4] },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.successDark, borderRadius: Radius.md, padding: Spacing[3], marginBottom: Spacing[3] },
  toastError: { backgroundColor: Colors.dangerDark },
  toastText: { color: Colors.white, fontSize: Typography.sm, fontWeight: Typography.medium },
  avatarCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing[4], backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[5], marginBottom: Spacing[3], ...Shadow.sm },
  avatarName: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textPrimary },
  avatarEmail: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], marginBottom: Spacing[4] },
  sectionIcon: { width: 32, height: 32, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  sectionSub: { fontSize: 10, color: Colors.gray400, marginTop: 1 },
  helperText: { fontSize: 11, color: Colors.gray400, marginTop: -Spacing[2], marginBottom: Spacing[3] },
  showPwRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginTop: -Spacing[2], marginBottom: Spacing[3] },
  showPwText: { fontSize: 11, color: Colors.gray400 },
});
