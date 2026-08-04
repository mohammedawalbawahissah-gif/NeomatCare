/**
 * src/components/ai/TriageAIPanel.jsx
 * Inline AI panel for triage note analysis. Mounted inside CaseDetailScreen
 * alongside the clinical-notes form. Matches web's TriageAIPanel.jsx.
 *
 * Props:
 *   note     {string}   - Current triage note text
 *   caseId   {string}   - Emergency case UUID
 *   onApply  {function} - Callback({ danger_signs, presenting_complaint_suggestion })
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { aiApi, getErrorMessage } from '../../api/client';
import { Spinner, Badge } from '../ui';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius } from '../../constants/theme';

const SEVERITY_VARIANT = { critical: 'danger', high: 'warning', moderate: 'warning', low: 'success' };
const CONFIDENCE_COLOR = { high: Colors.successDark, medium: Colors.warningDark, low: Colors.dangerDark };

export default function TriageAIPanel({ note, caseId, onApply, onSpeakableText }) {
  const [result, setResult]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [expanded, setExpanded] = useState(true);

  const analyse = async () => {
    if (!note?.trim()) { setError('Please write a triage note first.'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const { data } = await aiApi.triageExtract(note, caseId);
      setResult(data.data);
    } catch (err) {
      setError(getErrorMessage(err) || 'AI analysis failed. Please try again.');
    } finally { setLoading(false); }
  };

  const handleApply = () => {
    if (!result) return;
    onApply?.({
      danger_signs: result.danger_signs || [],
      presenting_complaint_suggestion: result.presenting_complaint_suggestion || '',
    });
  };

  const speakableText = result && [
    `${result.severity} severity, ${result.confidence} confidence.`,
    result.key_observations?.length ? `Key observations: ${result.key_observations.join('. ')}.` : '',
    result.presenting_complaint_suggestion ? `Suggested presenting complaint: ${result.presenting_complaint_suggestion}` : '',
    result.missing_fields?.length ? `Missing clinical fields: ${result.missing_fields.join(', ')}.` : '',
  ].filter(Boolean).join(' ');

  useEffect(() => { onSpeakableText?.(speakableText || null); }, [speakableText]);

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={() => setExpanded((e) => !e)}>
        <View style={styles.headerIcon}><Ionicons name="sparkles" size={13} color={Colors.white} /></View>
        <Text style={styles.headerTitle}>AI Triage Analysis</Text>
        <Text style={styles.headerHint}>{result ? 'Results ready' : 'Analyse note'}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={Colors.primaryDark} />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          {!result && !loading && (
            <View>
              <Text style={styles.hintText}>Tap "Analyse" to have the AI extract danger signs, severity, and identify missing clinical fields from your triage note.</Text>
              <TouchableOpacity style={[styles.analyseBtn, !note?.trim() && styles.analyseBtnDisabled]} onPress={analyse} disabled={!note?.trim()}>
                <Ionicons name="sparkles" size={14} color={Colors.white} />
                <Text style={styles.analyseBtnText}>Analyse Triage Note</Text>
              </TouchableOpacity>
            </View>
          )}

          {loading && (
            <View style={styles.loadingRow}>
              <Spinner size="small" />
              <Text style={styles.loadingText}>Analysing with AI…</Text>
            </View>
          )}

          {!!error && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle-outline" size={15} color={Colors.dangerDark} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {result && (
            <View style={{ gap: Spacing[3] }}>
              <View style={styles.badgeRow}>
                <Badge label={`${result.severity?.toUpperCase()} SEVERITY`} variant={SEVERITY_VARIANT[result.severity] || 'default'} />
                <Text style={[styles.confidenceText, { color: CONFIDENCE_COLOR[result.confidence] }]}>{result.confidence} confidence</Text>
              </View>

              {result.danger_signs?.length > 0 && (
                <View>
                  <Text style={styles.sectionLabel}>Detected Danger Signs</Text>
                  <View style={styles.chipWrap}>
                    {result.danger_signs.map((sign) => (
                      <View key={sign} style={styles.dangerChip}><Text style={styles.dangerChipText}>{sign.replace(/_/g, ' ')}</Text></View>
                    ))}
                  </View>
                </View>
              )}

              {result.key_observations?.length > 0 && (
                <View>
                  <Text style={styles.sectionLabel}>Key Observations</Text>
                  {result.key_observations.map((obs, i) => (
                    <Text key={i} style={styles.bulletText}>•  {obs}</Text>
                  ))}
                </View>
              )}

              {!!result.presenting_complaint_suggestion && (
                <View>
                  <Text style={styles.sectionLabel}>Suggested Presenting Complaint</Text>
                  <View style={styles.quoteBox}><Text style={styles.quoteText}>"{result.presenting_complaint_suggestion}"</Text></View>
                </View>
              )}

              {result.missing_fields?.length > 0 && (
                <View style={styles.missingBox}>
                  <Text style={styles.missingLabel}>Missing Clinical Fields</Text>
                  <View style={styles.chipWrap}>
                    {result.missing_fields.map((f) => (
                      <View key={f} style={styles.missingChip}><Text style={styles.missingChipText}>{f}</Text></View>
                    ))}
                  </View>
                </View>
              )}

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.applyBtn} onPress={handleApply}>
                  <Ionicons name="checkmark-circle" size={12} color={Colors.white} />
                  <Text style={styles.applyBtnText}>Apply Suggestions</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.reanalyseBtn} onPress={analyse}>
                  <Text style={styles.reanalyseBtnText}>Re-analyse</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderColor: Colors.primaryLight, borderRadius: Radius.lg, backgroundColor: Colors.primaryLight, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3] },
  headerIcon: { width: 24, height: 24, borderRadius: Radius.sm, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.primaryDark },
  headerHint: { fontSize: 11, color: Colors.primaryDark },
  body: { paddingHorizontal: Spacing[4], paddingBottom: Spacing[4], borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', paddingTop: Spacing[3] },
  hintText: { fontSize: Typography.xs, color: Colors.primaryDark, marginBottom: Spacing[3] },
  analyseBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: 16, paddingVertical: 10 },
  analyseBtnDisabled: { opacity: 0.5 },
  analyseBtnText: { color: Colors.white, fontSize: Typography.sm, fontWeight: Typography.medium },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loadingText: { fontSize: Typography.sm, color: Colors.primaryDark },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  errorText: { flex: 1, fontSize: Typography.sm, color: Colors.dangerDark },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flexWrap: 'wrap' },
  confidenceText: { fontSize: Typography.xs, fontWeight: Typography.medium },
  sectionLabel: { fontSize: 11, fontWeight: Typography.semibold, color: Colors.gray400, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dangerChip: { backgroundColor: Colors.dangerLight, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  dangerChipText: { fontSize: 11, fontWeight: Typography.medium, color: Colors.dangerDark },
  bulletText: { fontSize: Typography.xs, color: Colors.textSecondary, marginBottom: 3 },
  quoteBox: { backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 8 },
  quoteText: { fontSize: Typography.xs, color: Colors.textSecondary, fontStyle: 'italic' },
  missingBox: { backgroundColor: Colors.warningLight, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  missingLabel: { fontSize: 11, fontWeight: Typography.semibold, color: Colors.warningDark, textTransform: 'uppercase', marginBottom: 4 },
  missingChip: { backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  missingChipText: { fontSize: 11, color: Colors.warningDark },
  actionRow: { flexDirection: 'row', gap: Spacing[2] },
  applyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  applyBtnText: { color: Colors.white, fontSize: 11, fontWeight: Typography.medium },
  reanalyseBtn: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  reanalyseBtnText: { fontSize: 11, fontWeight: Typography.medium, color: Colors.textSecondary },
});
