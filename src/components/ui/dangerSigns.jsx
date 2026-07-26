import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Badge } from './index';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius } from '../../constants/theme';

// Codes match backend DangerSign.TextChoices exactly
export const ALL_DANGER_SIGNS = [
  'PPH', 'APH', 'RUPTURED_UTERUS', 'ECLAMPSIA', 'SEVERE_PRE_ECLAMPSIA',
  'OBSTRUCTED_LABOUR', 'CORD_PROLAPSE', 'PUERPERAL_SEPSIS', 'CHORIOAMNIONITIS',
  'NEONATAL_DISTRESS', 'PRETERM_LABOUR', 'NEONATAL_SEPSIS', 'SEVERE_ANAEMIA', 'MALPRESENTATION',
];

export const DANGER_LABELS = {
  PPH: 'PPH', APH: 'APH', RUPTURED_UTERUS: 'Ruptured Uterus', ECLAMPSIA: 'Eclampsia',
  SEVERE_PRE_ECLAMPSIA: 'Severe Pre-Eclampsia', OBSTRUCTED_LABOUR: 'Obstructed Labour',
  CORD_PROLAPSE: 'Cord Prolapse', PUERPERAL_SEPSIS: 'Puerperal Sepsis',
  CHORIOAMNIONITIS: 'Chorioamnionitis', NEONATAL_DISTRESS: 'Neonatal Distress',
  PRETERM_LABOUR: 'Preterm Labour', NEONATAL_SEPSIS: 'Neonatal Sepsis',
  SEVERE_ANAEMIA: 'Severe Anaemia', MALPRESENTATION: 'Malpresentation',
};

// ─── Toggleable chip group used on Case create/edit forms ────────────────────
export const DangerSignPicker = ({ value = [], onChange }) => {
  const toggle = (sign) => {
    onChange(value.includes(sign) ? value.filter((s) => s !== sign) : [...value, sign]);
  };
  return (
    <View style={styles.chipWrap}>
      {ALL_DANGER_SIGNS.map((sign) => {
        const active = value.includes(sign);
        return (
          <TouchableOpacity
            key={sign}
            onPress={() => toggle(sign)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{DANGER_LABELS[sign]}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

// ─── Read-only danger sign badge list (case cards, detail views) ─────────────
export const DangerSignList = ({ signs = [] }) => {
  if (!signs || signs.length === 0) {
    return <Text style={styles.noneText}>No danger signs recorded</Text>;
  }
  return (
    <View style={styles.chipWrap}>
      {signs.map((s) => (
        <Badge key={s} label={DANGER_LABELS[s] || s.replace(/_/g, ' ')} variant="danger" />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white,
  },
  chipActive: { backgroundColor: Colors.danger, borderColor: Colors.danger },
  chipText: { fontSize: Typography.xs, fontWeight: Typography.medium, color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },
  noneText: { fontSize: Typography.xs, color: Colors.gray400 },
});
