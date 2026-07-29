import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { Input, Button, ErrorBanner } from '../../components/ui';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

export default function WellnessCompanionScreen({ navigation }) {
  const { register, verifyOtp, resendOtp, error, clearError } = useAuth();

  const [step, setStep] = useState('details'); // 'details' | 'otp'
  const [otpMeta, setOtpMeta] = useState(null);

  const [form, setForm] = useState({
    name: '', email: '', password: '', password2: '',
    phone_number: '', otp_channel: 'sms', wellness_type: 'maternal',
  });
  const [localError, setLocalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const set = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    setLocalError(''); clearError();
    if (!form.name.trim() || !form.email.trim() || !form.password || !form.password2) {
      setLocalError('Please fill in all required fields.'); return;
    }
    if (form.password !== form.password2) { setLocalError('Passwords do not match.'); return; }
    if (form.password.length < 8) { setLocalError('Password must be at least 8 characters.'); return; }
    if (form.otp_channel === 'sms' && !form.phone_number.trim()) {
      setLocalError('A phone number is required for SMS verification.'); return;
    }

    setSubmitting(true);
    const result = await register({
      name: form.name, email: form.email,
      password: form.password, password2: form.password2,
      role: 'patient', otp_channel: form.otp_channel,
      phone_number: form.phone_number, wellness_type: form.wellness_type,
    });
    setSubmitting(false);

    if (!result.success) { setLocalError(result.error || 'Registration failed.'); return; }
    setOtpMeta({ userId: result.user_id, channel: result.channel, email: form.email, phone: form.phone_number });
    setStep('otp');
  };

  if (step === 'otp') {
    return (
      <PatientOtpStep
        meta={otpMeta}
        verifyOtp={verifyOtp}
        resendOtp={resendOtp}
        onBack={() => setStep('details')}
      />
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Register for the wellness companion portal</Text>
        <Text style={styles.subtitle}>View your care history and share feedback</Text>

        <View style={styles.card}>
          <ErrorBanner message={localError || error} onDismiss={() => { setLocalError(''); clearError(); }} />

          <Input label="Full Name" required value={form.name} onChangeText={set('name')}
            placeholder="Your full name" icon="person-outline" />

          <Text style={styles.channelLabel}>Which best describes you? <Text style={styles.req}>*</Text></Text>
          <View style={styles.channelRow}>
            {[
              { value: 'maternal', label: 'Pregnant / New Mother', sub: 'Pregnancy tracker & more' },
              { value: 'wellness', label: 'General Wellness',      sub: 'Cycle tracking & nutrition' },
            ].map((wt) => (
              <TouchableOpacity
                key={wt.value}
                style={[styles.channelBtn, form.wellness_type === wt.value && styles.channelBtnActive]}
                onPress={() => set('wellness_type')(wt.value)}
              >
                <Text style={[styles.channelBtnLabel, form.wellness_type === wt.value && styles.channelBtnLabelActive]}>{wt.label}</Text>
                <Text style={styles.channelBtnSub}>{wt.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Input label="Email Address" required value={form.email} onChangeText={set('email')}
            placeholder="you@example.com" icon="mail-outline" autoCapitalize="none" keyboardType="email-address" />

          <Input
            label={`Phone Number${form.otp_channel === 'sms' ? ' *' : ''}`}
            required={form.otp_channel === 'sms'}
            value={form.phone_number} onChangeText={set('phone_number')}
            placeholder="+233..." icon="call-outline" keyboardType="phone-pad"
          />

          <Text style={styles.channelLabel}>Verify account via <Text style={styles.req}>*</Text></Text>
          <View style={styles.channelRow}>
            {[{ value: 'sms', label: 'SMS', sub: 'Code to your phone' }, { value: 'email', label: 'Email', sub: 'Code to your inbox' }].map((ch) => (
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

          <Input label="Password" required value={form.password} onChangeText={set('password')}
            placeholder="Min. 8 characters" secureTextEntry icon="lock-closed-outline" />

          <Input label="Confirm Password" required value={form.password2} onChangeText={set('password2')}
            placeholder="Repeat password" secureTextEntry icon="lock-closed-outline" />

          <Button title="Continue" onPress={handleSubmit} loading={submitting} fullWidth icon="arrow-forward" iconPosition="right" />
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

function PatientOtpStep({ meta, verifyOtp, resendOtp, onBack }) {
  const [code, setCode]           = useState('');
  const [loading, setLoading]     = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError]         = useState('');
  const [info, setInfo]           = useState('');

  const destination = meta?.channel === 'sms' ? meta?.phone : meta?.email;

  const handleVerify = async () => {
    setError('');
    if (code.length !== 6) { setError('Please enter the full 6-digit code.'); return; }
    setLoading(true);
    const result = await verifyOtp(meta.userId, code);
    setLoading(false);
    if (!result.success) setError(result.error || 'Invalid or expired code. Please try again.');
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
        <Text style={styles.subtitle}>Almost there</Text>

        <View style={styles.card}>
          <View style={styles.hintBox}>
            <Text style={styles.hintText}>We sent a 6-digit code to {destination}</Text>
          </View>
          <ErrorBanner message={error} onDismiss={() => setError('')} />
          {!!info && <View style={styles.infoBox}><Text style={styles.infoText}>{info}</Text></View>}

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
});
