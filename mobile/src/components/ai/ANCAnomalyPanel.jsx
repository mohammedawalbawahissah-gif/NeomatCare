/**
 * src/components/ai/ANCAnomalyPanel.jsx
 * AI-powered ANC visit anomaly detection. Mounted inside PatientDetailScreen's
 * ANC tab. Matches web's ANCAnomalyPanel.jsx.
 *
 * Props: patientId, visitCount
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { aiApi, getErrorMessage } from '../../api/client';
import { Spinner } from '../ui';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius } from '../../constants/theme';

const SEVERITY_CONFIG = {
  high:   { color: Colors.dangerDark,  bg: '#fef2f2', border: '#fecaca', icon: 'warning' },
  medium: { color: Colors.warningDark, bg: '#fffbeb', border: '#fde68a', icon: 'warning' },
  low:    { color: Colors.infoDark,    bg: '#eff6ff', border: '#bfdbfe', icon: 'information-circle' },
};

export default function ANCAnomalyPanel({ patientId, visitCount, onSpeakableText }) {
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const detect = async () => {
    setLoading(true); setError(''); setResult(null);
    try {
      const { data } = await aiApi.ancAnomaly(patientId);
      setResult(data);
    } catch (err) {
      setError(getErrorMessage(err) || 'Anomaly detection failed.');
    } finally { setLoading(false); }
  };

  // Computed and reported before the visitCount early-return below, so this
  // hook runs unconditionally on every render (Rules of Hooks).
  const speakableText = result?.data && [
    result.data.summary,
    result.data.recommended_risk_escalation ? 'Risk level re-computed — patient risk may have escalated.' : '',
    result.data.patterns?.length
      ? `Detected patterns: ${result.data.patterns.map((p) => `${p.type.replace(/_/g, ' ')}: ${p.description}`).join('. ')}.`
      : '',
  ].filter(Boolean).join(' ');
  useEffect(() => { onSpeakableText?.(speakableText || null); }, [speakableText]);

  if (visitCount < 2) {
    return (
      <View style={styles.tooFewRow}>
        <Ionicons name="information-circle-outline" size={13} color={Colors.gray400} />
        <Text style={styles.tooFewText}>AI anomaly detection requires at least 2 ANC visits.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={14} color={Colors.primaryLight} />
        <Text style={styles.headerTitle}>AI ANC Pattern Analysis</Text>
        <Text style={styles.headerCount}>{visitCount} visits</Text>
      </View>

      <View style={styles.body}>
        {!result && !loading && (
          <View>
            <Text style={styles.hintText}>Analyse {visitCount} ANC visits for concerning trends: rising blood pressure, missed visits, weight changes, or fetal heart rate anomalies.</Text>
            <TouchableOpacity style={styles.analyseBtn} onPress={detect}>
              <Ionicons name="sparkles" size={14} color={Colors.white} />
              <Text style={styles.analyseBtnText}>Analyse Visit Patterns</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading && (
          <View style={styles.loadingRow}><Spinner size="small" /><Text style={styles.loadingText}>Analysing {visitCount} ANC visits…</Text></View>
        )}

        {!!error && (
          <View style={styles.errorRow}><Ionicons name="alert-circle-outline" size={13} color={Colors.dangerDark} /><Text style={styles.errorText}>{error}</Text></View>
        )}

        {result && (
          <View style={{ gap: Spacing[3] }}>
            <View style={[styles.summaryBox, { backgroundColor: result.data?.anomalies_found ? '#fffbeb' : '#f0fdf4', borderColor: result.data?.anomalies_found ? '#fde68a' : '#86efac' }]}>
              <Ionicons name={result.data?.anomalies_found ? 'warning' : 'checkmark-circle'} size={15} color={result.data?.anomalies_found ? Colors.warningDark : Colors.successDark} />
              <Text style={[styles.summaryText, { color: result.data?.anomalies_found ? '#92400e' : '#065f46' }]}>{result.data?.summary}</Text>
            </View>

            {result.data?.recommended_risk_escalation && (
              <View style={styles.escalationBox}>
                <Ionicons name="warning" size={13} color={Colors.dangerDark} />
                <Text style={styles.escalationText}>Risk level re-computed — patient risk may have escalated. Refresh to see updated risk.</Text>
              </View>
            )}

            {result.data?.patterns?.length > 0 && (
              <View style={{ gap: Spacing[2] }}>
                <Text style={styles.sectionLabel}>Detected Patterns</Text>
                {result.data.patterns.map((p, i) => {
                  const cfg = SEVERITY_CONFIG[p.severity] || SEVERITY_CONFIG.low;
                  return (
                    <View key={i} style={[styles.patternRow, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                      <Ionicons name={cfg.icon} size={13} color={cfg.color} style={{ marginTop: 1 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.patternType, { color: cfg.color }]}>{p.type.replace(/_/g, ' ')}</Text>
                        <Text style={styles.patternDesc}>{p.description}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            <TouchableOpacity onPress={detect}><Text style={styles.refreshText}>Re-analyse</Text></TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, backgroundColor: Colors.gray50, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], backgroundColor: '#1e293b' },
  headerTitle: { flex: 1, color: Colors.white, fontSize: Typography.sm, fontWeight: Typography.semibold },
  headerCount: { fontSize: 11, color: '#94a3b8' },
  body: { paddingHorizontal: Spacing[4], paddingVertical: Spacing[3] },
  hintText: { fontSize: Typography.xs, color: Colors.textSecondary, marginBottom: Spacing[3] },
  analyseBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: '#1e293b', borderRadius: Radius.md, paddingHorizontal: 16, paddingVertical: 10 },
  analyseBtnText: { color: Colors.white, fontSize: Typography.sm, fontWeight: Typography.medium },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText: { fontSize: Typography.xs, color: Colors.textSecondary },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  errorText: { flex: 1, fontSize: Typography.xs, color: Colors.dangerDark },
  summaryBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  summaryText: { flex: 1, fontSize: Typography.sm },
  escalationBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  escalationText: { flex: 1, fontSize: 11, fontWeight: Typography.medium, color: Colors.dangerDark },
  sectionLabel: { fontSize: 11, fontWeight: Typography.semibold, color: Colors.gray400, textTransform: 'uppercase', letterSpacing: 0.5 },
  patternRow: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  patternType: { fontSize: Typography.xs, fontWeight: Typography.semibold, marginBottom: 2, textTransform: 'capitalize' },
  patternDesc: { fontSize: Typography.xs, color: Colors.textSecondary },
  refreshText: { fontSize: 11, color: Colors.gray400, textDecorationLine: 'underline' },
  tooFewRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: Spacing[2] },
  tooFewText: { fontSize: Typography.xs, color: Colors.gray400 },
});
