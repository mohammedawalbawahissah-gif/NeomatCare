/**
 * src/components/voice/VoiceEntryBar.jsx
 *
 * Global voice-entry control for a form. Drop `<VoiceEntryTrigger>` once at
 * the top of the form and `<VoiceEntryBar>` once anywhere in the tree (it
 * renders nothing until active). Pairs with the `useVoiceEntry` hook, which
 * owns all the sequencing logic — this file is presentation only.
 */
import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

export function VoiceEntryTrigger({ onPress, count, style }) {
  if (!count) return null;
  return (
    <TouchableOpacity style={[styles.trigger, style]} onPress={onPress}>
      <Ionicons name="mic-outline" size={15} color={Colors.primary} />
      <Text style={styles.triggerText}>Start Voice Entry</Text>
      <Text style={styles.triggerCount}>{count} field{count !== 1 ? 's' : ''}</Text>
    </TouchableOpacity>
  );
}

export default function VoiceEntryBar({ voiceEntry }) {
  const { active, field, index, total, state, error, toggleCapture, next, cancel } = voiceEntry;
  if (!active || !field) return null;

  const isLast = index === total - 1;

  return (
    <View style={styles.bar}>
      <View style={styles.topRow}>
        <Text style={styles.progress}>Field {index + 1} of {total}</Text>
        <TouchableOpacity onPress={cancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={18} color={Colors.gray400} />
        </TouchableOpacity>
      </View>

      <Text style={styles.fieldLabel} numberOfLines={1}>{field.label}</Text>

      {!!error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.controlsRow}>
        <TouchableOpacity
          style={[styles.micBtn, state === 'listening' && styles.micBtnActive, state === 'transcribing' && styles.micBtnDisabled]}
          onPress={toggleCapture}
          disabled={state === 'transcribing'}
        >
          {state === 'transcribing' ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Ionicons name={state === 'listening' ? 'stop' : 'mic'} size={22} color={state === 'listening' ? Colors.white : Colors.primary} />
          )}
        </TouchableOpacity>
        <Text style={styles.hint}>
          {state === 'listening' ? 'Listening — speak now' : state === 'transcribing' ? 'Transcribing…' : 'Tap mic to (re)capture, or tap Next to continue'}
        </Text>
      </View>

      <TouchableOpacity style={styles.nextBtn} onPress={next} disabled={state === 'transcribing'}>
        <Text style={styles.nextText}>{isLast ? 'Done' : 'Next field'}</Text>
        <Ionicons name={isLast ? 'checkmark' : 'arrow-forward'} size={14} color={Colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', backgroundColor: Colors.primaryLight,
    borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 9,
    marginBottom: Spacing[3],
  },
  triggerText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.primaryDark },
  triggerCount: { fontSize: 11, color: Colors.primaryDark, opacity: 0.7 },

  bar: {
    position: 'absolute', left: Spacing[3], right: Spacing[3], bottom: Spacing[4],
    backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing[4],
    ...Shadow.lg, borderWidth: 1, borderColor: Colors.border, zIndex: 60,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progress: { fontSize: 11, fontWeight: Typography.semibold, color: Colors.gray400, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldLabel: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary, marginTop: 4, marginBottom: Spacing[3] },
  error: { fontSize: Typography.xs, color: Colors.dangerDark, marginBottom: Spacing[2] },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], marginBottom: Spacing[3] },
  micBtn: { width: 48, height: 48, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primaryLight },
  micBtnActive: { backgroundColor: Colors.dangerDark },
  micBtnDisabled: { backgroundColor: Colors.gray100 },
  hint: { flex: 1, fontSize: Typography.xs, color: Colors.textSecondary },
  nextBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 12 },
  nextText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.white },
});
