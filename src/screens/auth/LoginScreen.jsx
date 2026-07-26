import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { Input, Button, ErrorBanner } from '../../components/ui';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleLogin = async () => {
    setError('');
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    const result = await login(email.trim().toLowerCase(), password);
    setLoading(false);
    if (!result.success) {
      setError(result.error || 'Invalid email or password.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoWrap}>
          <View style={styles.logoBadge}>
            <Ionicons name="heart" size={26} color={Colors.white} />
          </View>
          <Text style={styles.brand}>NeoMatCare</Text>
          <Text style={styles.subtitle}>Emergency Referral System</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign in</Text>

          <ErrorBanner message={error} onDismiss={() => setError('')} />

          <Input
            label="Email Address"
            required
            value={email}
            onChangeText={setEmail}
            placeholder="you@facility.gh"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            icon="mail-outline"
            returnKeyType="next"
          />

          <Input
            label="Password"
            required
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            icon="lock-closed-outline"
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          <Button
            title="Sign In"
            onPress={handleLogin}
            loading={loading}
            fullWidth
            style={{ marginTop: Spacing[2] }}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>New to NeoMatCare? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={styles.footerLink}>Create staff account</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.footer}>
          <Text style={styles.footerText}>Are you a patient? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('PatientRegister')}>
            <Text style={styles.footerLink}>Register for the patient portal</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray900 },
  scroll:    { flexGrow: 1, justifyContent: 'center', padding: Spacing[6] },
  logoWrap:  { alignItems: 'center', marginBottom: Spacing[8] },
  logoBadge: {
    width: 56, height: 56, borderRadius: Radius.xl, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing[3], ...Shadow.lg,
  },
  brand:    { color: Colors.white, fontSize: Typography['2xl'], fontWeight: Typography.bold },
  subtitle: { color: Colors.gray400, fontSize: Typography.sm, marginTop: 4 },
  card: {
    backgroundColor: Colors.white, borderRadius: Radius['2xl'], padding: Spacing[6], ...Shadow.lg,
  },
  cardTitle: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.textPrimary, marginBottom: Spacing[4] },
  footer:     { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing[3], flexWrap: 'wrap' },
  footerText: { fontSize: Typography.sm, color: Colors.gray400 },
  footerLink: { fontSize: Typography.sm, color: Colors.primaryLight, fontWeight: Typography.semibold },
});
