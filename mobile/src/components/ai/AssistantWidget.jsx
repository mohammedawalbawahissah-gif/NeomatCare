/**
 * src/components/ai/AssistantWidget.jsx
 * Floating, role-aware AI assistant widget for all NeoMatCare portals.
 * Matches web's AssistantWidget.jsx. Mounted once, globally, in App.jsx.
 *
 * RN adaptations from web:
 * - No sessionStorage — open/closed + chat history reset on app relaunch
 *   (acceptable; matches how most mobile chat widgets behave)
 * - Fixed-position FAB + bottom-anchored panel instead of a floating box,
 *   since RN has no fixed-position-with-margins-from-edges equivalent to CSS
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet,
  KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { aiApi, getErrorMessage } from '../../api/client';
import { Spinner } from '../ui';
import { startListening, speak, stopSpeaking, getVoiceLanguage, LANGUAGES } from '../../services/voice';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

const ROLE_CONFIG = {
  health_worker:  { label: 'Clinical Assistant',   color: Colors.primary,  greeting: "Hi! I'm your clinical assistant. Ask me about danger signs, triage, referrals, or how to use NeoMatCare." },
  facility_admin: { label: 'Facility Assistant',   color: Colors.infoDark, greeting: 'Hi! I can help with facility operations, capacity management, referral patterns, and platform questions.' },
  specialist:     { label: 'Specialist Assistant', color: '#7c3aed',       greeting: 'Hello. I can assist with case review, consultation notes, clinical protocols, and incoming referrals.' },
  driver:         { label: 'Dispatch Assistant',   color: '#d97706',       greeting: 'Hi! I can help with dispatch information, patient transport protocols, and status updates.' },
  superadmin:     { label: 'Admin Assistant',      color: Colors.dangerDark, greeting: 'Hello. I have full system context and can assist with any NeoMatCare operation, data, or administration.' },
  patient:        { label: 'Pregnancy Companion',  color: Colors.primary,  greeting: "Hi there! 💚 I'm here to support you through your pregnancy journey. Ask me anything about your health, ANC visits, or what to expect." },
};
const DEFAULT_CONFIG = ROLE_CONFIG.health_worker;

const QUICK_PROMPTS = {
  health_worker:  ['What are signs of eclampsia?', 'When should I escalate a PPH case?', 'How do I create a referral?'],
  facility_admin: ['How do I update facility capacity?', 'What referral statuses mean?', 'How do I add a transport vehicle?'],
  specialist:     ['What should I review in a referral?', 'How do I update a consultation status?', 'Signs of neonatal sepsis?'],
  driver:         ['I have a new dispatch, what should I do?', 'How do I update my trip status?', 'Patient seems unwell — what should I do?'],
  superadmin:     ['Show me how to manage users', 'How do I add a new facility?', 'Explain referral statuses'],
  patient:        ['What should I eat during pregnancy?', 'When should I go to the hospital immediately?', 'What happens at my next ANC visit?'],
};

// ── Simple markdown-ish line renderer (bold **text**, bullets) ────────────────
function RenderMessage({ text, isUser }) {
  const lines = text.split('\n');
  return (
    <View>
      {lines.map((line, i) => {
        if (!line.trim()) return <View key={i} style={{ height: 4 }} />;
        const parts = line.split(/\*\*(.*?)\*\*/g);
        const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('• ');
        return (
          <View key={i} style={isBullet ? styles.bulletRow : undefined}>
            {isBullet && <View style={styles.bulletDot} />}
            <Text style={[styles.msgText, isUser && styles.msgTextUser]}>
              {parts.map((p, j) => (j % 2 === 1 ? <Text key={j} style={styles.msgBold}>{p}</Text> : p))}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export default function AssistantWidget({ context = {} }) {
  const { role } = useAuth();
  const insets = useSafeAreaInsets();
  const config = ROLE_CONFIG[role] || DEFAULT_CONFIG;
  const prompts = QUICK_PROMPTS[role] || QUICK_PROMPTS.health_worker;

  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState([{ role: 'assistant', content: config.greeting }]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const scrollRef = useRef(null);

  // ── Voice: dictate the input, and read replies aloud ─────────────────────
  const [micState, setMicState]   = useState('idle'); // idle | listening | transcribing
  const [micError, setMicError]   = useState('');
  const [speakingIndex, setSpeakingIndex] = useState(-1); // -1 = nothing playing, -2 = "read all" in progress
  const micStopRef = useRef(null);
  const readAllCancelledRef = useRef(false);
  const lang = getVoiceLanguage();
  const langInfo = LANGUAGES.find((l) => l.code === lang);

  const toggleMic = () => {
    if (micState === 'listening') {
      if (lang !== 'en') setMicState('transcribing');
      micStopRef.current?.();
      return;
    }
    if (micState !== 'idle') return;
    setMicError('');
    setMicState('listening');
    micStopRef.current = startListening(lang, {
      onResult: (text) => setInput((prev) => (prev ? `${prev} ${text}` : text)),
      onError: (err) => { setMicError(err.message); setMicState('idle'); },
      onEnd: () => setMicState((s) => (s === 'listening' ? 'idle' : 'idle')),
    });
  };

  const speakOne = async (i, text) => {
    if (speakingIndex === i) { stopSpeaking(); setSpeakingIndex(-1); return; }
    stopSpeaking();
    readAllCancelledRef.current = true; // interrupts any in-progress "read all"
    setSpeakingIndex(i);
    try { await speak(text, lang); } catch { /* convenience feature, fail quietly */ }
    finally { setSpeakingIndex((cur) => (cur === i ? -1 : cur)); }
  };

  const readAllReplies = async () => {
    if (speakingIndex === -2) { stopSpeaking(); readAllCancelledRef.current = true; setSpeakingIndex(-1); return; }
    stopSpeaking();
    readAllCancelledRef.current = false;
    setSpeakingIndex(-2);
    for (const m of messages) {
      if (readAllCancelledRef.current) break;
      if (m.role !== 'assistant') continue;
      try { await speak(m.content, lang); } catch { /* skip to next on failure */ }
    }
    if (!readAllCancelledRef.current) setSpeakingIndex(-1);
  };


  const sendMessage = useCallback(async (text) => {
    const content = (text || input).trim();
    if (!content || loading) return;

    const updated = [...messages, { role: 'user', content }];
    setMessages(updated);
    setInput('');
    setError('');
    setLoading(true);

    const apiMessages = updated
      .filter((_, i) => !(i === 0 && updated[0].role === 'assistant'))
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const { data } = await aiApi.chat(apiMessages, context);
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err) {
      setError(getErrorMessage(err) || 'Could not reach the AI assistant. Please try again.');
      setMessages((prev) => prev.slice(0, -1));
      setInput(content);
    } finally { setLoading(false); }
  }, [input, messages, loading, context]);

  const clearChat = () => {
    setMessages([{ role: 'assistant', content: config.greeting }]);
    setError(''); setInput('');
  };

  return (
    <>
      {/* FAB — bottom offset clears the tab bar (height: 64 + insets.bottom,
          see RootNavigator's TAB_OPTIONS) with a 16px gap above it. */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: config.color, bottom: insets.bottom + 80 }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="sparkles" size={24} color={Colors.white} />
      </TouchableOpacity>

      {/* Chat panel */}
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setOpen(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheet}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: config.color }]}>
              <View style={styles.headerIcon}><Ionicons name="heart" size={16} color={Colors.white} /></View>
              <Text style={styles.headerTitle}>{config.label}</Text>
              {langInfo?.readAloud && (
                <TouchableOpacity onPress={readAllReplies} style={styles.headerBtn}>
                  <Ionicons name={speakingIndex === -2 ? 'volume-mute-outline' : 'volume-medium-outline'} size={16} color="rgba(255,255,255,0.85)" />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={clearChat} style={styles.headerBtn}><Ionicons name="refresh" size={16} color="rgba(255,255,255,0.85)" /></TouchableOpacity>
              <TouchableOpacity onPress={() => setOpen(false)} style={styles.headerBtn}><Ionicons name="chevron-down" size={20} color="rgba(255,255,255,0.85)" /></TouchableOpacity>
            </View>

            {/* Messages */}
            <ScrollView
              ref={scrollRef}
              style={styles.messagesArea}
              contentContainerStyle={{ padding: Spacing[4] }}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              {messages.map((msg, i) => {
                const isUser = msg.role === 'user';
                return (
                  <View key={i} style={[styles.msgRow, isUser && styles.msgRowUser]}>
                    {!isUser && <View style={[styles.avatarDot, { backgroundColor: config.color }]}><Ionicons name="heart" size={10} color={Colors.white} /></View>}
                    <View style={[styles.bubble, isUser ? { backgroundColor: config.color } : styles.bubbleAssistant]}>
                      <RenderMessage text={msg.content} isUser={isUser} />
                    </View>
                    {!isUser && langInfo?.readAloud && (
                      <TouchableOpacity onPress={() => speakOne(i, msg.content)} style={styles.msgSpeakBtn}>
                        <Ionicons name={speakingIndex === i ? 'volume-mute-outline' : 'volume-medium-outline'} size={13} color={Colors.gray400} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}

              {loading && (
                <View style={styles.msgRow}>
                  <View style={[styles.avatarDot, { backgroundColor: config.color }]}><Ionicons name="heart" size={10} color={Colors.white} /></View>
                  <View style={styles.bubbleAssistant}><Spinner size="small" /></View>
                </View>
              )}

              {!!error && (
                <View style={styles.errorBox}><Ionicons name="alert-circle-outline" size={13} color={Colors.dangerDark} /><Text style={styles.errorText}>{error}</Text></View>
              )}
            </ScrollView>

            {/* Quick prompts */}
            {messages.length <= 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.promptsRow} contentContainerStyle={{ gap: 6, paddingHorizontal: Spacing[3] }}>
                {prompts.map((p) => (
                  <TouchableOpacity key={p} style={styles.promptChip} onPress={() => sendMessage(p)} disabled={loading}>
                    <Text style={styles.promptChipText}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Input */}
            {!!micError && <Text style={styles.micErrorText}>{micError}</Text>}
            <View style={styles.inputRow}>
              {langInfo?.dictation && (
                <TouchableOpacity
                  style={[styles.micBtn, micState === 'listening' && styles.micBtnActive]}
                  onPress={toggleMic}
                  disabled={micState === 'transcribing'}
                >
                  {micState === 'transcribing' ? (
                    <Spinner size="small" color={Colors.gray400} />
                  ) : (
                    <Ionicons name={micState === 'listening' ? 'stop' : 'mic-outline'} size={17} color={micState === 'listening' ? Colors.white : config.color} />
                  )}
                </TouchableOpacity>
              )}
              <TextInput
                style={styles.input} value={input} onChangeText={setInput}
                placeholder="Ask anything…" placeholderTextColor={Colors.gray400}
                multiline editable={!loading} onSubmitEditing={() => sendMessage()}
              />
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: (!input.trim() || loading) ? Colors.gray100 : config.color }]}
                onPress={() => sendMessage()} disabled={!input.trim() || loading}
              >
                {loading ? <Spinner size="small" color={Colors.gray400} /> : <Ionicons name="send" size={16} color={(!input.trim()) ? Colors.gray400 : Colors.white} />}
              </TouchableOpacity>
            </View>
            <Text style={styles.disclaimer}>AI may make mistakes. Always verify clinical decisions.</Text>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute', right: Spacing[5], width: 56, height: 56, borderRadius: Radius.full,
    alignItems: 'center', justifyContent: 'center', ...Shadow.lg, zIndex: 50,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.white, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, height: '78%', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3] },
  headerIcon: { width: 30, height: 30, borderRadius: Radius.md, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, color: Colors.white, fontSize: Typography.sm, fontWeight: Typography.semibold },
  headerBtn: { padding: 6 },
  messagesArea: { flex: 1 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: Spacing[3] },
  msgRowUser: { flexDirection: 'row-reverse' },
  avatarDot: { width: 22, height: 22, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  bubble: { maxWidth: '80%', borderRadius: Radius.xl, paddingHorizontal: 12, paddingVertical: 9 },
  bubbleAssistant: { backgroundColor: Colors.gray100, borderRadius: Radius.xl, paddingHorizontal: 12, paddingVertical: 9, maxWidth: '80%' },
  msgText: { fontSize: Typography.sm, color: Colors.textPrimary, lineHeight: 19 },
  msgTextUser: { color: Colors.white },
  msgBold: { fontWeight: Typography.bold },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  bulletDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.gray400, marginTop: 7 },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.dangerLight, borderRadius: Radius.md, padding: Spacing[3] },
  errorText: { flex: 1, fontSize: Typography.xs, color: Colors.dangerDark },
  promptsRow: { flexGrow: 0, marginBottom: Spacing[2] },
  promptChip: { backgroundColor: Colors.gray100, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 7 },
  promptChipText: { fontSize: 11, color: Colors.textSecondary },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: Spacing[3], paddingBottom: Spacing[2] },
  input: { flex: 1, backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, paddingHorizontal: 14, paddingVertical: 10, fontSize: Typography.sm, maxHeight: 90, color: Colors.textPrimary },
  micBtn: { width: 38, height: 38, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.border },
  micBtnActive: { backgroundColor: Colors.dangerDark, borderColor: Colors.dangerDark },
  micErrorText: { fontSize: 11, color: Colors.dangerDark, paddingHorizontal: Spacing[3], paddingBottom: 4 },
  msgSpeakBtn: { padding: 4, alignSelf: 'flex-end' },
  sendBtn: { width: 38, height: 38, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  disclaimer: { textAlign: 'center', fontSize: 10, color: Colors.gray400, paddingBottom: Spacing[3] },
});
