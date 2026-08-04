import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal as RNModal, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LANGUAGES, getVoiceLanguage, setVoiceLanguage } from '../../services/voice';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

/**
 * Mirrors VoiceLanguagePicker.jsx on web (same LANGUAGES list, same
 * "applies everywhere" framing) but as a FAB + modal, matching how
 * SyncQueueBell/NotificationBell already work on mobile — there's no
 * persistent header bar here the way AppLayout gives web one.
 */
export default function VoiceLanguagePicker() {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState(getVoiceLanguage());

  const choose = async (code) => {
    await setVoiceLanguage(code);
    setLang(code);
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.fab, { top: insets.top + Spacing[3] }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="language-outline" size={18} color={Colors.textSecondary} />
      </TouchableOpacity>

      <RNModal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={[styles.panel, { marginTop: insets.top + Spacing[10] }]} onPress={() => {}}>
            <Text style={styles.title}>Voice language</Text>
            <Text style={styles.subtitle}>Used for dictation and read-aloud everywhere in the app</Text>
            {LANGUAGES.map((l) => (
              <TouchableOpacity key={l.code} style={styles.row} onPress={() => choose(l.code)}>
                <Text style={styles.rowLabel}>{l.label}</Text>
                {l.code === lang ? (
                  <Ionicons name="checkmark" size={16} color={Colors.primary} />
                ) : (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {!l.dictation && <Text style={styles.tag}>no mic</Text>}
                    {!l.readAloud && <Text style={styles.tag}>no audio</Text>}
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </RNModal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: Spacing[4] + 96, // sits left of SyncQueueBell, which sits left of NotificationBell
    width: 40, height: 40, borderRadius: Radius.full,
    backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center',
    zIndex: 40, ...Shadow.sm,
  },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)', alignItems: 'flex-end' },
  panel: {
    width: 260, maxWidth: '90%', marginRight: Spacing[3],
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing[4], ...Shadow.md,
  },
  title: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  subtitle: { fontSize: Typography.xs, color: Colors.textSecondary, marginTop: 2, marginBottom: Spacing[3] },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing[2],
  },
  rowLabel: { fontSize: Typography.sm, color: Colors.textPrimary },
  tag: { fontSize: 9, color: Colors.gray400 },
});
