/**
 * src/components/voice/ReadAloudBar.jsx
 *
 * Global "Read Aloud" control for a detail/read screen. Drop `<ReadAloudTrigger>`
 * once near the top of the screen. Pairs with `useReadAloud`.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getVoiceLanguage, LANGUAGES } from '../../services/voice';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius } from '../../constants/theme';

export default function ReadAloudTrigger({ readAloud, style }) {
  const { state, currentLabel, playAll, stop } = readAloud;
  const lang = getVoiceLanguage();
  const langInfo = LANGUAGES.find((l) => l.code === lang);
  if (!langInfo?.readAloud) return null;

  if (state === 'playing') {
    return (
      <TouchableOpacity style={[styles.trigger, styles.triggerActive, style]} onPress={stop}>
        <Ionicons name="volume-mute-outline" size={15} color={Colors.white} />
        <Text style={styles.triggerTextActive} numberOfLines={1}>
          {currentLabel ? `Reading: ${currentLabel}…` : 'Reading…'}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={[styles.trigger, style]} onPress={playAll}>
      <Ionicons name="volume-medium-outline" size={15} color={Colors.textSecondary} />
      <Text style={styles.triggerText}>Read Aloud</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', backgroundColor: Colors.gray100,
    borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 9,
    marginBottom: Spacing[3],
  },
  triggerActive: { backgroundColor: Colors.primary },
  triggerText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textSecondary },
  triggerTextActive: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.white, maxWidth: 200 },
});
