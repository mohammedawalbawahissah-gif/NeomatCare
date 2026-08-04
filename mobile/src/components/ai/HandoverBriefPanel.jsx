/**
 * src/components/ai/HandoverBriefPanel.jsx
 * Generates and displays an AI clinical handover brief for a referral or case.
 * Mounted inside CaseDetailScreen and ReferralDetailScreen. Matches web's
 * HandoverBriefPanel.jsx (no `compact` mode on mobile — always full card,
 * since there's no equivalent "tight inline button" spot on these screens).
 *
 * Props: referralId (preferred), caseId (fallback)
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { aiApi, getErrorMessage } from '../../api/client';
import { Spinner } from '../ui';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius } from '../../constants/theme';

const PURPLE = '#7c3aed';
const PURPLE_DARK = '#6d28d9';

export default function HandoverBriefPanel({ referralId, caseId, onSpeakableText }) {
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [copied, setCopied]   = useState(false);

  const generate = async () => {
    setLoading(true); setError(''); setResult(null);
    try {
      const params = referralId ? { referral_id: referralId } : { case_id: caseId };
      const { data } = await aiApi.referralHandover(params);
      setResult(data.data);
    } catch (err) {
      setError(getErrorMessage(err) || 'Handover brief generation failed.');
    } finally { setLoading(false); }
  };

  const copyBrief = async () => {
    if (!result?.brief) return;
    await Clipboard.setStringAsync(result.brief);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const speakableText = result && [
    result.brief,
    result.immediate_actions?.length ? `Immediate actions: ${result.immediate_actions.join('. ')}.` : '',
  ].filter(Boolean).join(' ');

  useEffect(() => { onSpeakableText?.(speakableText || null); }, [speakableText]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="document-text-outline" size={15} color="#ddd6fe" />
        <Text style={styles.headerTitle}>AI Clinical Handover Brief</Text>
        {result && (
          <TouchableOpacity onPress={generate}>
            <Ionicons name="refresh" size={14} color="#c4b5fd" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.body}>
        {!result && !loading && (
          <View>
            <Text style={styles.hintText}>Generate a clinical handover brief for the receiving specialist or facility — patient background, current presentation, danger signs, and immediate needs.</Text>
            <TouchableOpacity style={styles.generateBtn} onPress={generate}>
              <Ionicons name="sparkles" size={14} color={Colors.white} />
              <Text style={styles.generateBtnText}>Generate Handover Brief</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading && (
          <View style={styles.loadingRow}><Spinner size="small" /><Text style={styles.loadingText}>Drafting clinical handover…</Text></View>
        )}

        {!!error && (
          <View style={styles.errorRow}><Ionicons name="alert-circle-outline" size={13} color={Colors.dangerDark} /><Text style={styles.errorText}>{error}</Text></View>
        )}

        {result && (
          <View style={{ gap: Spacing[3] }}>
            <View style={styles.briefBox}>
              <Text style={styles.briefText}>{result.brief}</Text>
              <TouchableOpacity style={styles.copyBtn} onPress={copyBrief}>
                <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={13} color={copied ? Colors.successDark : PURPLE} />
              </TouchableOpacity>
            </View>

            {result.immediate_actions?.length > 0 && (
              <View>
                <Text style={styles.sectionLabel}>Immediate Actions Required</Text>
                {result.immediate_actions.map((act, i) => (
                  <View key={i} style={styles.actionRow2}>
                    <View style={styles.actionNum}><Text style={styles.actionNumText}>{i + 1}</Text></View>
                    <Text style={styles.actionText}>{act}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.flagRow}>
              {result.blood_products_likely && <View style={[styles.flagChip, { backgroundColor: '#fee2e2' }]}><Text style={[styles.flagText, { color: '#b91c1c' }]}>🩸 Blood Products Likely</Text></View>}
              {result.theatre_likely && <View style={[styles.flagChip, { backgroundColor: '#ffedd5' }]}><Text style={[styles.flagText, { color: '#c2410c' }]}>🔪 Theatre Likely</Text></View>}
              {result.icu_likely && <View style={[styles.flagChip, { backgroundColor: '#ede9fe' }]}><Text style={[styles.flagText, { color: PURPLE_DARK }]}>🏥 ICU Likely</Text></View>}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderColor: '#ddd6fe', borderRadius: Radius.lg, backgroundColor: '#f5f3ff', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], backgroundColor: PURPLE_DARK },
  headerTitle: { flex: 1, color: Colors.white, fontSize: Typography.sm, fontWeight: Typography.semibold },
  body: { paddingHorizontal: Spacing[4], paddingVertical: Spacing[3] },
  hintText: { fontSize: Typography.xs, color: '#4c1d95', marginBottom: Spacing[3] },
  generateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: PURPLE_DARK, borderRadius: Radius.md, paddingHorizontal: 16, paddingVertical: 10 },
  generateBtnText: { color: Colors.white, fontSize: Typography.sm, fontWeight: Typography.medium },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText: { fontSize: Typography.xs, color: PURPLE_DARK },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  errorText: { flex: 1, fontSize: Typography.xs, color: Colors.dangerDark },
  briefBox: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: '#ede9fe', paddingHorizontal: 14, paddingVertical: 12 },
  briefText: { fontSize: Typography.sm, color: Colors.textPrimary, lineHeight: 20, paddingRight: 24 },
  copyBtn: { position: 'absolute', top: 8, right: 8, padding: 6, borderRadius: Radius.sm, backgroundColor: '#f5f3ff' },
  sectionLabel: { fontSize: 11, fontWeight: Typography.semibold, color: Colors.gray400, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  actionRow2: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  actionNum: { width: 16, height: 16, borderRadius: Radius.full, backgroundColor: '#ede9fe', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  actionNumText: { fontSize: 9, fontWeight: Typography.bold, color: PURPLE_DARK },
  actionText: { flex: 1, fontSize: Typography.xs, color: Colors.textPrimary },
  flagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  flagChip: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  flagText: { fontSize: 11, fontWeight: Typography.medium },
});
