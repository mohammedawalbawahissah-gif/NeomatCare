/**
 * src/components/ai/RiskNarratePanel.jsx
 * Plain-language AI risk narration. Mounted inside PatientDetailScreen next
 * to the risk badge. Matches web's RiskNarratePanel.jsx.
 *
 * Props: patientId, riskLevel ("high"|"medium"|"low"), riskFlags (array)
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { aiApi, getErrorMessage } from '../../api/client';
import { Spinner } from '../ui';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius } from '../../constants/theme';

const RISK_BG     = { high: '#fef2f2', medium: '#fffbeb', low: '#f0fdf4' };
const RISK_BORDER = { high: '#fecaca', medium: '#fde68a', low: '#86efac' };
const RISK_HEADER = { high: Colors.dangerDark, medium: Colors.warningDark, low: Colors.successDark };

export default function RiskNarratePanel({ patientId, riskLevel, riskFlags, onSpeakableText }) {
  const [result, setResult]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [expanded, setExpanded] = useState(false);

  const level = riskLevel?.toLowerCase() || 'low';

  const speakableText = result && [
    result.summary,
    result.action_points?.length ? `Action points: ${result.action_points.join('. ')}.` : '',
    result.urgency_note,
  ].filter(Boolean).join(' ');

  // Report our speakable content up to the screen's global Read Aloud
  // control instead of having our own per-panel speaker button.
  useEffect(() => { onSpeakableText?.(speakableText || null); }, [speakableText]);

  const narrate = async () => {
    setLoading(true); setError(''); setResult(null);
    try {
      const { data } = await aiApi.riskNarrate(patientId);
      setResult(data.data);
      setExpanded(true);
    } catch (err) {
      setError(getErrorMessage(err) || 'AI narration failed.');
    } finally { setLoading(false); }
  };

  return (
    <View style={[styles.container, { backgroundColor: RISK_BG[level], borderColor: RISK_BORDER[level] }]}>
      <View style={[styles.header, { backgroundColor: RISK_HEADER[level] }]}>
        <Ionicons name="sparkles" size={14} color={Colors.white} />
        <Text style={styles.headerTitle}>AI Risk Explanation</Text>
        {result && (
          <TouchableOpacity onPress={() => setExpanded((e) => !e)}>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.body}>
        {!result && !loading && (
          <View>
            <Text style={styles.hintText}>Get a plain-language explanation of why this patient is <Text style={{ fontWeight: Typography.bold }}>{level} risk</Text> and what to watch for.</Text>
            <TouchableOpacity style={styles.actionBtn} onPress={narrate}>
              <Ionicons name="sparkles" size={12} color={Colors.textSecondary} />
              <Text style={styles.actionBtnText}>Explain Risk Profile</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading && (
          <View style={styles.loadingRow}><Spinner size="small" /><Text style={styles.loadingText}>Generating explanation…</Text></View>
        )}

        {!!error && (
          <View style={styles.errorRow}><Ionicons name="alert-circle-outline" size={13} color={Colors.dangerDark} /><Text style={styles.errorText}>{error}</Text></View>
        )}

        {result && expanded && (
          <View style={{ gap: Spacing[3] }}>
            <Text style={styles.summaryText}>{result.summary}</Text>

            {result.action_points?.length > 0 && (
              <View>
                <Text style={styles.sectionLabel}>Action Points</Text>
                {result.action_points.map((pt, i) => (
                  <View key={i} style={styles.pointRow}>
                    <View style={styles.pointNum}><Text style={styles.pointNumText}>{i + 1}</Text></View>
                    <Text style={styles.pointText}>{pt}</Text>
                  </View>
                ))}
              </View>
            )}

            {!!result.urgency_note && (
              <View style={styles.urgencyBox}>
                <Ionicons name="bulb-outline" size={13} color={Colors.warningDark} />
                <Text style={styles.urgencyText}>{result.urgency_note}</Text>
              </View>
            )}

            <TouchableOpacity onPress={narrate}><Text style={styles.refreshText}>Refresh</Text></TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing[4], paddingVertical: 10 },
  headerTitle: { flex: 1, color: Colors.white, fontSize: Typography.sm, fontWeight: Typography.semibold },
  body: { paddingHorizontal: Spacing[4], paddingVertical: Spacing[3] },
  hintText: { fontSize: Typography.xs, color: Colors.textSecondary, marginBottom: Spacing[2] },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  actionBtnText: { fontSize: 11, fontWeight: Typography.medium, color: Colors.textSecondary },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText: { fontSize: Typography.xs, color: Colors.textSecondary },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  errorText: { flex: 1, fontSize: Typography.xs, color: Colors.dangerDark },
  summaryText: { fontSize: Typography.sm, color: Colors.textPrimary, lineHeight: 20 },
  sectionLabel: { fontSize: 11, fontWeight: Typography.semibold, color: Colors.gray400, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  pointRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  pointNum: { width: 16, height: 16, borderRadius: Radius.full, backgroundColor: Colors.white, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  pointNumText: { fontSize: 9, fontWeight: Typography.bold, color: Colors.gray400 },
  pointText: { flex: 1, fontSize: Typography.xs, color: Colors.textSecondary },
  urgencyBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 8 },
  urgencyText: { flex: 1, fontSize: Typography.xs, color: Colors.textSecondary, fontStyle: 'italic' },
  refreshText: { fontSize: 11, color: Colors.gray400, textDecorationLine: 'underline' },
});
