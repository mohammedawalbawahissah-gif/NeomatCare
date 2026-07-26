import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { facilitiesApi } from '../../api/client';
import { Input, Select, Button, ErrorBanner } from '../../components/ui';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

const ROLES = [
  { value: 'health_worker',  label: 'Health Worker' },
  { value: 'facility_admin', label: 'Facility Admin' },
  { value: 'specialist',     label: 'Specialist' },
  { value: 'driver',         label: 'Driver' },
];
const FACILITY_REQUIRED = ['health_worker', 'facility_admin'];

export default function RegisterScreen({ navigation }) {
  const { register, verifyOtp, resendOtp, error, clearError } = useAuth();

  const [step, setStep] = useState('details'); // 'details' | 'otp' | 'pending'
  const [otpMeta, setOtpMeta] = useState(null); // { userId, channel, email, phone }
  const [pendingMessage, setPendingMessage] = useState('');

  // ── Step 1 state ──
  const [form, setForm] = useState({
    name: '', email: '', password: '', password2: '',
    role: 'health_worker', facility: '',
    phone_number: '', license_number: '', otp_channel: 'sms',
  });
  const [facilities, setFacilities]               = useState([]);
  const [facilitiesLoading, setFacilitiesLoading]  = useState(true);
  const [localError, setLocalError]                = useState('');
  const [submitting, setSubmitting]                = useState(false);

  useEffect(() => {
    facilitiesApi.list()
      .then(({ data }) => setFacilities(Array.isArray(data) ? data : (data.results || [])))
      .catch(() => setLocalError('Could not load facilities. Pull to refresh and try again.'))
      .finally(() => setFacilitiesLoading(false));
  }, []);

  const set = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));
  const needsFacility = FACILITY_REQUIRED.includes(form.role);
  const needsPhone    = form.otp_channel === 'sms' || form.role === 'driver';

  const handleDetailsSubmit = async () => {
    setLocalError(''); clearError();
    if (!form.name.trim() || !form.email.trim() || !form.password || !form.password2) {
      setLocalError('Please fill in all required fields.'); return;
    }
    if (form.password !== form.password2) { setLocalError('Passwords do not match.'); return; }
    if (form.password.length < 8) { setLocalError('Password must be at least 8 characters.'); return; }
    if (needsFacility && !form.facility) { setLocalError('Please select a facility.'); return; }
    if (form.otp_channel === 'sms' && !form.phone_number.trim()) {
      setLocalError('Phone number is required for SMS verification.'); return;
    }

    setSubmitting(true);
    const payload = {
      name: form.name, email: form.email,
      password: form.password, password2: form.password2,
      role: form.role, otp_channel: form.otp_channel,
      ...(needsFacility && { facility: form.facility }),
      ...(form.phone_number && { phone_number: form.phone_number }),
      ...(form.license_number && { license_number: form.license_number }),
    };
    const result = await register(payload);
    setSubmitting(false);

    if (!result.success) { setLocalError(result.error || 'Registration failed.'); return; }
    setOtpMeta({
      userId: result.user_id, channel: result.channel,
      email: form.email, phone: form.phone_number,
    });
    setStep('otp');
  };

  if (step === 'otp') {
    return (
      <OtpStep
        meta={otpMeta}
        verifyOtp={verifyOtp}
        resendOtp={resendOtp}
        onBack={() => setStep('details')}
        onVerified={(result) => {
          if (result?.pendingApproval) {
            setPendingMessage(result.message || '');
            setStep('pending');
            return;
          }
          /* AuthContext already logged the user in; RootNavigator will redirect */
        }}
      />
    );
  }

  if (step === 'pending') {
    return (
      <View style={[styles.container, styles.centeredScreen]}>
        <View style={styles.pendingCard}>
          <View style={styles.pendingIconWrap}>
            <Ionicons name="time-outline" size={44} color={Colors.warningDark} />
          </View>
          <Text style={styles.pendingTitle}>Awaiting Approval</Text>
          <Text style={styles.pendingBody}>
            {pendingMessage ||
              'Your account has been verified. A Facility Admin or SuperAdmin needs to approve it before you can log in — you\'ll be able to sign in once that happens.'}
          </Text>
          <Button
            title="Back to Sign In"
            onPress={() => navigation.navigate('Login')}
            fullWidth
            style={{ marginTop: Spacing[5] }}
          />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Create staff account</Text>
        <Text style={styles.subtitle}>Join the NeoMatCare platform</Text>

        <View style={styles.card}>
          <ErrorBanner message={localError || error} onDismiss={() => { setLocalError(''); clearError(); }} />

          <Input label="Full Name" required value={form.name} onChangeText={set('name')}
            placeholder="e.g. Ama Owusu" icon="person-outline" />

          <Input label="Email Address" required value={form.email} onChangeText={set('email')}
            placeholder="you@facility.gh" icon="mail-outline" autoCapitalize="none" keyboardType="email-address" />

          <Select label="Role" required value={form.role} onValueChange={set('role')} options={ROLES} />

          {needsFacility && (
            <Select
              label="Facility" required value={form.facility} onValueChange={set('facility')}
              placeholder={facilitiesLoading ? 'Loading facilities…' : 'Select a facility'}
              options={facilities.map((f) => ({ value: f.id, label: f.name }))}
            />
          )}

          <Text style={styles.channelLabel}>Verify account via <Text style={styles.req}>*</Text></Text>
          <View style={styles.channelRow}>
            {[{ value: 'sms', label: '📱 SMS', sub: 'Text to phone' }, { value: 'email', label: '✉️ Email', sub: 'Code to inbox' }].map((ch) => (
              <TouchableOpacity
                key={ch.value}
                style={[styles.channelBtn, form.otp_channel === ch.value && styles.channelBtnActive]}
                onPress={() => set('otp_channel')(ch.value)}
              >
                <Text style={[styles.channelBtnLabel, form.otp_channel === ch.value && styles.channelBtnLabelActive]}>{ch.label}</Text>
                <Text style={styles.channelBtnSub}>{ch.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {needsPhone && (
            <Input
              label="Phone Number" required={form.otp_channel === 'sms'}
              value={form.phone_number} onChangeText={set('phone_number')}
              placeholder="+233..." icon="call-outline" keyboardType="phone-pad"
            />
          )}

          {form.role === 'driver' && (
            <Input
              label="License Number (optional)" value={form.license_number}
              onChangeText={set('license_number')} placeholder="e.g. GH-1234-2020" icon="card-outline"
            />
          )}

          <Input label="Password" required value={form.password} onChangeText={set('password')}
            placeholder="Min. 8 characters" secureTextEntry icon="lock-closed-outline" />

          <Input label="Confirm Password" required value={form.password2} onChangeText={set('password2')}
            placeholder="Repeat your password" secureTextEntry icon="lock-closed-outline" />

          <Button title="Continue" onPress={handleDetailsSubmit} loading={submitting} fullWidth icon="arrow-forward" iconPosition="right" />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.footerLink}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Step 2: OTP entry — shared shape with WellnessCompanionScreen ───────────
function OtpStep({ meta, verifyOtp, resendOtp, onBack, onVerified }) {
  const [code, setCode]           = useState('');
  const [loading, setLoading]     = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError]         = useState('');
  const [info, setInfo]           = useState('');

  const destination = meta?.channel === 'sms' ? meta?.phone : meta?.email;

  const handleVerify = async () => {
    setError('');
    if (code.length !== 6) { setError('Please enter the 6-digit code.'); return; }
    setLoading(true);
    const result = await verifyOtp(meta.userId, code);
    setLoading(false);
    if (!result.success) { setError(result.error || 'Invalid or expired code.'); return; }
    onVerified(result);
  };

  const handleResend = async () => {
    setResending(true); setError(''); setInfo('');
    const result = await resendOtp(meta.userId);
    setInfo(result.success ? 'A new code has been sent.' : 'Could not resend. Try again shortly.');
    setResending(false);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Enter verification code</Text>
        <Text style={styles.subtitle}>Your account is almost ready</Text>

        <View style={styles.card}>
          <View style={styles.hintBox}>
            <Text style={styles.hintText}>We sent a 6-digit code to {destination}</Text>
          </View>
          <ErrorBanner message={error} onDismiss={() => setError('')} />
          {!!info && (
            <View style={styles.infoBox}><Text style={styles.infoText}>{info}</Text></View>
          )}

          <Input
            label="Verification Code" required value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456" keyboardType="number-pad" icon="key-outline"
            inputStyle={{ letterSpacing: 4, fontWeight: '700', textAlign: 'center' }}
          />
          <Text style={styles.helperText}>Code expires in 10 minutes</Text>

          <Button title="Verify & Activate" onPress={handleVerify} loading={loading} fullWidth icon="checkmark-circle" style={{ marginTop: Spacing[3] }} />
          <Button title={resending ? 'Sending…' : 'Resend code'} onPress={handleResend} variant="outline" fullWidth disabled={resending} icon="refresh" style={{ marginTop: Spacing[2] }} />
          <Button title="Back" onPress={onBack} variant="ghost" fullWidth style={{ marginTop: Spacing[2] }} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll:    { flexGrow: 1, padding: Spacing[5], paddingTop: Spacing[10] },
  title:     { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary, textAlign: 'center' },
  subtitle:  { fontSize: Typography.sm, color: Colors.textSecondary, textAlign: 'center', marginTop: 4, marginBottom: Spacing[5] },
  card:      { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[5], ...Shadow.md },
  channelLabel: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary, marginBottom: Spacing[1] },
  req:          { color: Colors.danger },
  channelRow:   { flexDirection: 'row', gap: Spacing[2], marginBottom: Spacing[4] },
  channelBtn:   { flex: 1, borderWidth: 2, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing[3], alignItems: 'center' },
  channelBtnActive:      { borderColor: Colors.primaryDark, backgroundColor: Colors.primaryLight },
  channelBtnLabel:       { fontWeight: Typography.semibold, fontSize: Typography.sm, color: Colors.textPrimary },
  channelBtnLabelActive: { color: Colors.primaryDark },
  channelBtnSub:         { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  footer:     { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing[5] },
  footerText: { fontSize: Typography.sm, color: Colors.textSecondary },
  footerLink: { fontSize: Typography.sm, color: Colors.primaryDark, fontWeight: Typography.semibold },
  hintBox:  { backgroundColor: Colors.primaryLight, borderRadius: Radius.md, padding: Spacing[3], marginBottom: Spacing[3] },
  hintText: { color: Colors.primaryDark, fontSize: Typography.sm },
  infoBox:  { backgroundColor: Colors.infoLight, borderRadius: Radius.md, padding: Spacing[3], marginBottom: Spacing[3] },
  infoText: { color: Colors.infoDark, fontSize: Typography.sm },
  helperText: { fontSize: Typography.xs, color: Colors.gray400, marginTop: -Spacing[2], marginBottom: Spacing[2] },
  centeredScreen: { alignItems: 'center', justifyContent: 'center', padding: Spacing[5] },
  pendingCard: { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[6], alignItems: 'center', width: '100%', maxWidth: 420, ...Shadow.md },
  pendingIconWrap: { width: 76, height: 76, borderRadius: 38, backgroundColor: Colors.warningLight, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing[4] },
  pendingTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary, marginBottom: Spacing[2] },
  pendingBody: { fontSize: Typography.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});
