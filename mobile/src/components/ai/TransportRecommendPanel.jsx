/**
 * src/components/ai/TransportRecommendPanel.jsx
 * AI transport recommendation panel for the "Request Transport" modal on
 * CaseDetailScreen. Matches web's TransportRecommendPanel.jsx.
 *
 * Props: caseId, availableVehicles (from transportApi.vehicles.available()),
 *        estimatedTravelMinutes (default 30), onSelect(vehicleId)
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { aiApi, getErrorMessage } from '../../api/client';
import { Spinner } from '../ui';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius } from '../../constants/theme';

const URGENCY_CONFIG = {
  immediate: { bg: '#fef2f2', color: Colors.dangerDark, label: 'IMMEDIATE' },
  urgent:    { bg: '#ffedd5', color: '#c2410c',          label: 'URGENT' },
  routine:   { bg: '#f0fdf4', color: Colors.successDark, label: 'ROUTINE' },
};
const AMBER = '#d97706';
const AMBER_DARK = '#b45309';

export default function TransportRecommendPanel({ caseId, availableVehicles = [], estimatedTravelMinutes = 30, onSelect, onSpeakableText }) {
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const recommend = async () => {
    if (!availableVehicles.length) { setError('No vehicles available to analyse.'); return; }
    setLoading(true); setError(''); setResult(null);

    const vehicles = availableVehicles.map((v) => ({
      id: v.id,
      type: v.vehicle_type || v.type || 'unknown',
      status: v.status,
      distance_km: v.distance_km || null,
      driver_name: v.driver_name || 'Unassigned',
    }));

    try {
      const { data } = await aiApi.transportRecommend(caseId, estimatedTravelMinutes, vehicles);
      setResult(data);
    } catch (err) {
      setError(getErrorMessage(err) || 'Recommendation failed.');
    } finally { setLoading(false); }
  };

  const recommended = result?.data?.recommended_vehicle_id
    ? availableVehicles.find((v) => v.id === result.data.recommended_vehicle_id)
    : null;
  const urgencyCfg = URGENCY_CONFIG[result?.data?.urgency_classification] || URGENCY_CONFIG.routine;

  const speakableText = result?.data && [
    `${urgencyCfg.label?.toLowerCase()} urgency.`,
    result.data.estimated_dispatch_time_minutes ? `Estimated dispatch time: ${result.data.estimated_dispatch_time_minutes} minutes.` : '',
    recommended
      ? `Recommended vehicle: ${recommended.registration_number || recommended.name || result.data.recommended_vehicle_id}.`
      : (result.data.recommended_vehicle_id ? `Recommended vehicle ID: ${result.data.recommended_vehicle_id}.` : 'No suitable vehicle found.'),
    result.data.reasoning,
    result.data.alternatives?.length ? `Alternatives: ${result.data.alternatives.join(', ')}.` : '',
  ].filter(Boolean).join(' ');

  useEffect(() => { onSpeakableText?.(speakableText || null); }, [speakableText]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="car-outline" size={15} color="#fde68a" />
        <Text style={styles.headerTitle}>AI Transport Recommendation</Text>
        <Text style={styles.headerCount}>{availableVehicles.length} vehicles</Text>
      </View>

      <View style={styles.body}>
        {!result && !loading && (
          <View>
            <Text style={styles.hintText}>AI will analyse case urgency and available vehicles to recommend the optimal dispatch.</Text>
            <TouchableOpacity style={[styles.recommendBtn, !availableVehicles.length && styles.recommendBtnDisabled]} onPress={recommend} disabled={!availableVehicles.length}>
              <Ionicons name="sparkles" size={14} color={Colors.white} />
              <Text style={styles.recommendBtnText}>Recommend Vehicle</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading && (
          <View style={styles.loadingRow}><Spinner size="small" /><Text style={styles.loadingText}>Analysing dispatch options…</Text></View>
        )}

        {!!error && (
          <View style={styles.errorRow}><Ionicons name="alert-circle-outline" size={13} color={Colors.dangerDark} /><Text style={styles.errorText}>{error}</Text></View>
        )}

        {result && (
          <View style={{ gap: Spacing[3] }}>
            <View style={styles.urgencyRow}>
              <View style={[styles.urgencyChip, { backgroundColor: urgencyCfg.bg }]}>
                <Text style={[styles.urgencyChipText, { color: urgencyCfg.color }]}>{urgencyCfg.label}</Text>
              </View>
              {!!result.data?.estimated_dispatch_time_minutes && (
                <View style={styles.etaRow}>
                  <Ionicons name="time-outline" size={11} color={Colors.textSecondary} />
                  <Text style={styles.etaText}>~{result.data.estimated_dispatch_time_minutes} min estimated dispatch</Text>
                </View>
              )}
            </View>

            {result.data?.recommended_vehicle_id ? (
              <View style={styles.recommendedBox}>
                <Text style={styles.sectionLabel}>Recommended Vehicle</Text>
                {recommended ? (
                  <View style={styles.vehicleRow}>
                    <View style={styles.vehicleIcon}><Ionicons name="car" size={18} color={AMBER} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.vehicleName}>{recommended.registration || result.data.recommended_vehicle_id}</Text>
                      <Text style={styles.vehicleMeta}>{recommended.vehicle_type?.replace(/_/g, ' ') || 'Vehicle'} · Driver: {recommended.driver_name || 'Unassigned'}</Text>
                    </View>
                    <Ionicons name="checkmark-circle" size={18} color={Colors.successDark} />
                  </View>
                ) : (
                  <Text style={styles.vehicleName}>Vehicle ID: {result.data.recommended_vehicle_id}</Text>
                )}

                {!!result.data.reasoning && <Text style={styles.reasoningText}>{result.data.reasoning}</Text>}

                {!!onSelect && (
                  <TouchableOpacity style={styles.confirmBtn} onPress={() => onSelect(result.data.recommended_vehicle_id)}>
                    <Ionicons name="checkmark-circle" size={14} color={Colors.white} />
                    <Text style={styles.confirmBtnText}>Confirm This Vehicle</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.noVehicleBox}>
                <Ionicons name="alert-circle-outline" size={13} color={AMBER} style={{ marginTop: 1 }} />
                <Text style={styles.noVehicleText}>No suitable vehicle found. {result.data?.reasoning}</Text>
              </View>
            )}

            {result.data?.alternatives?.length > 0 && (
              <Text style={styles.alternativesText}>Alternatives: {result.data.alternatives.join(', ')}</Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderColor: '#fde68a', borderRadius: Radius.lg, backgroundColor: '#fffbeb', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], backgroundColor: AMBER },
  headerTitle: { flex: 1, color: Colors.white, fontSize: Typography.sm, fontWeight: Typography.semibold },
  headerCount: { fontSize: 11, color: '#fef3c7' },
  body: { paddingHorizontal: Spacing[4], paddingVertical: Spacing[3] },
  hintText: { fontSize: Typography.xs, color: '#78350f', marginBottom: Spacing[3] },
  recommendBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: AMBER, borderRadius: Radius.md, paddingHorizontal: 16, paddingVertical: 10 },
  recommendBtnDisabled: { opacity: 0.5 },
  recommendBtnText: { color: Colors.white, fontSize: Typography.sm, fontWeight: Typography.medium },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText: { fontSize: Typography.xs, color: '#78350f' },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  errorText: { flex: 1, fontSize: Typography.xs, color: Colors.dangerDark },
  urgencyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], flexWrap: 'wrap' },
  urgencyChip: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  urgencyChipText: { fontSize: 11, fontWeight: Typography.bold },
  etaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  etaText: { fontSize: Typography.xs, color: Colors.textSecondary },
  recommendedBox: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: '#fef3c7', paddingHorizontal: 14, paddingVertical: 12 },
  sectionLabel: { fontSize: 11, fontWeight: Typography.semibold, color: Colors.gray400, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  vehicleIcon: { width: 36, height: 36, borderRadius: Radius.md, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center' },
  vehicleName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  vehicleMeta: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },
  reasoningText: { fontSize: Typography.xs, color: Colors.textSecondary, fontStyle: 'italic', marginTop: Spacing[2] },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: AMBER, borderRadius: Radius.md, paddingVertical: 10, marginTop: Spacing[3] },
  confirmBtnText: { color: Colors.white, fontSize: Typography.sm, fontWeight: Typography.medium },
  noVehicleBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.white, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 8 },
  noVehicleText: { flex: 1, fontSize: Typography.xs, color: Colors.textSecondary },
  alternativesText: { fontSize: 11, color: Colors.gray400 },
});
