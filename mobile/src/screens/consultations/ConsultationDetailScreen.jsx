import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { consultationsApi, getErrorMessage } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Input, Select, Button, Modal, Spinner, Badge, ErrorBanner, Card } from '../../components/ui';
import VoiceEntryBar, { VoiceEntryTrigger } from '../../components/voice/VoiceEntryBar';
import useVoiceEntry from '../../hooks/useVoiceEntry';
import { useWebRTCCall } from '../../hooks/useWebRTCCall';
import Colors from '../../constants/colors';
import { Typography, Spacing, Radius, Shadow } from '../../constants/theme';

// TEMP (expo-go-test branch): lazy/guarded require, same reasoning as
// useWebRTCCall.js. Revert: restore the static
// `import { RTCView } from 'react-native-webrtc';` above.
let RTCView = null;
try {
  ({ RTCView } = require('react-native-webrtc'));
} catch {
  RTCView = null;
}
if (!RTCView) {
  // Expo Go fallback: plain placeholder so the video-call UI renders
  // instead of crashing. Never reached in a real dev-client build.
  RTCView = function RTCViewFallback({ style }) {
    return (
      <View style={[style, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }]}>
        <Text style={{ color: '#fff', fontSize: 12 }}>Video needs a rebuilt app (Expo Go)</Text>
      </View>
    );
  };
}

const STATUS_VARIANT = { pending: 'warning', active: 'info', completed: 'success', cancelled: 'danger' };
const STATUS_OPTIONS = [
  { value: 'active', label: 'Mark Active' }, { value: 'completed', label: 'Complete' }, { value: 'cancelled', label: 'Cancel' },
];
const fmt = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const fmtTime = (d) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export default function ConsultationDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const { isSuperadmin, isFacilityAdmin, user } = useAuth();
  const canManage = isSuperadmin || isFacilityAdmin;

  const [c, setC] = useState(null);
  const [specialist, setSpecialist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusModal, setStatusModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await consultationsApi.detail(id);
      setC(data);
      if (data.specialist) {
        consultationsApi.specialists.detail(data.specialist).then(({ data: s }) => setSpecialist(s)).catch(() => {});
      }
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <Spinner fullScreen />;
  if (error || !c) {
    return (
      <View style={styles.container}>
        <Header navigation={navigation} />
        <ErrorBanner message={error || 'Consultation not found.'} />
      </View>
    );
  }

  const canAct = !['completed', 'cancelled'].includes(c.status);

  return (
    <View style={styles.container}>
      <Header navigation={navigation} status={c.status} canManage={canManage} onEdit={() => setEditModal(true)} onDelete={isSuperadmin ? () => setDeleteModal(true) : null} />

      <ScrollView contentContainerStyle={{ padding: Spacing[4], paddingBottom: Spacing[10], gap: Spacing[3] }}>
        {canAct && <Button title="Update Status" icon="refresh" onPress={() => setStatusModal(true)} fullWidth />}

        <CallPanel consultation={c} specialist={specialist} currentUserId={user?.id} />
        <ChatPanel consultationId={id} user={user} />

        {!!c.notes && (
          <Card>
            <Text style={styles.cardLabel}>Notes</Text>
            <Text style={styles.notesBox}>{c.notes}</Text>
          </Card>
        )}

        <Card>
          <View style={styles.kvRow}><Text style={styles.kvKey}>Requested by</Text><Text style={styles.kvVal}>{c.requested_by === user?.id ? 'You' : (c.requested_by_name || '—')}</Text></View>
          <View style={styles.kvRow}><Text style={styles.kvKey}>Specialist</Text><Text style={styles.kvVal}>{c.specialist_name || 'Unassigned'}</Text></View>
          <View style={styles.kvRow}><Text style={styles.kvKey}>Created</Text><Text style={styles.kvVal}>{fmt(c.created_at)}</Text></View>
          {!!c.referral && (
            <TouchableOpacity style={styles.viewLink} onPress={() => navigation.navigate('ReferralDetail', { id: c.referral })}>
              <Text style={styles.viewLinkText}>View Referral</Text>
              <Ionicons name="arrow-forward" size={14} color={Colors.primaryDark} />
            </TouchableOpacity>
          )}
        </Card>
      </ScrollView>

      <StatusUpdateModal visible={statusModal} onClose={() => setStatusModal(false)} consultation={c} onUpdated={(u) => { setC(u); setStatusModal(false); }} />
      <EditNotesModal visible={editModal} onClose={() => setEditModal(false)} consultation={c} onUpdated={(u) => { setC(u); setEditModal(false); }} />
      <DeleteModal visible={deleteModal} onClose={() => setDeleteModal(false)} consultation={c} onDeleted={() => navigation.goBack()} />
    </View>
  );
}

function Header({ navigation, status, canManage, onEdit, onDelete }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + Spacing[5] }]}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Consultation</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {status && <Badge label={status} variant={STATUS_VARIANT[status]} />}
        {canManage && onEdit && (
          <TouchableOpacity onPress={onEdit}><Ionicons name="create-outline" size={20} color={Colors.primary} /></TouchableOpacity>
        )}
        {onDelete && (
          <TouchableOpacity onPress={onDelete}><Ionicons name="trash-outline" size={20} color={Colors.dangerDark} /></TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Call panel — tel:/WhatsApp deep links, plus a lightweight mock in-call UI ──
// (There's no real WebRTC backend; this mirrors the web app's simulated call flow.)
function CallPanel({ consultation, specialist, currentUserId }) {
  const call = useWebRTCCall(consultation?.id, currentUserId);
  const phone = specialist?.specialist_phone || specialist?.whatsapp_number;
  const canCall = !['completed', 'cancelled'].includes(consultation?.status);

  const fmtDur = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (call.status !== 'active') { setElapsed(0); return; }
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [call.status]);

  // ── Incoming call ────────────────────────────────────────────────────────
  if (call.status === 'ringing' && call.incomingOffer) {
    return (
      <View style={styles.callActiveCard}>
        <View style={styles.callActiveHeader}>
          <View style={[styles.callAvatar, { backgroundColor: Colors.primary }]}>
            <Ionicons name={call.incomingOffer.call_type === 'video' ? 'videocam' : 'call'} size={28} color={Colors.white} />
          </View>
          <Text style={styles.callName}>Incoming {call.incomingOffer.call_type} call</Text>
          <Text style={styles.callSub}>{call.incomingOffer.sender_name || 'Someone'} is calling</Text>
        </View>
        <View style={[styles.callControls, { justifyContent: 'center', gap: 24 }]}>
          <TouchableOpacity style={styles.callEndBtn} onPress={call.declineCall}>
            <Ionicons name="call" size={20} color={Colors.white} style={{ transform: [{ rotate: '135deg' }] }} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.callEndBtn, { backgroundColor: Colors.successDark }]} onPress={call.acceptCall}>
            <Ionicons name="call" size={20} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Active / connecting call ─────────────────────────────────────────────
  if (['calling', 'connecting', 'active'].includes(call.status)) {
    return (
      <View style={styles.callActiveCard}>
        <View style={styles.callActiveHeader}>
          <Text style={styles.callName}>{specialist?.user_name || specialist?.display_name || 'Specialist'}</Text>
          <Text style={styles.callSub}>
            {call.status === 'calling' ? 'Calling…' : call.status === 'connecting' ? 'Connecting…' : `${call.callType === 'video' ? 'Video call' : 'Audio call'} · ${fmtDur(elapsed)}`}
          </Text>
          {call.callType === 'video' ? (
            <View style={styles.videoContainer}>
              {call.remoteStream ? (
                <RTCView streamURL={call.remoteStream.toURL()} style={styles.remoteVideo} objectFit="cover" />
              ) : (
                <Text style={styles.waitingText}>Waiting for the other side to join…</Text>
              )}
              {call.localStream && !call.videoOff && (
                <RTCView streamURL={call.localStream.toURL()} style={styles.localVideo} objectFit="cover" mirror zOrder={1} />
              )}
            </View>
          ) : (
            <View style={styles.callAvatar}><Ionicons name="call" size={28} color={Colors.white} /></View>
          )}
          {!!call.errorMsg && <Text style={styles.callError}>{call.errorMsg}</Text>}
        </View>
        <View style={styles.callControls}>
          <TouchableOpacity style={[styles.callBtn, call.muted && styles.callBtnActive]} onPress={call.toggleMute}>
            <Ionicons name={call.muted ? 'mic-off' : 'mic'} size={18} color={call.muted ? Colors.dangerDark : Colors.textSecondary} />
          </TouchableOpacity>
          {call.callType === 'video' && (
            <TouchableOpacity style={[styles.callBtn, call.videoOff && styles.callBtnActive]} onPress={call.toggleVideo}>
              <Ionicons name={call.videoOff ? 'videocam-off' : 'videocam'} size={18} color={call.videoOff ? Colors.dangerDark : Colors.textSecondary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.callEndBtn} onPress={call.endCall}>
            <Ionicons name="call" size={20} color={Colors.white} style={{ transform: [{ rotate: '135deg' }] }} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Idle ──────────────────────────────────────────────────────────────────
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing[3] }}>
        <Ionicons name="call-outline" size={16} color={Colors.primary} />
        <Text style={styles.cardTitleText}>Call Specialist</Text>
      </View>
      {call.status === 'error' && !!call.errorMsg && <Text style={styles.callErrorIdle}>{call.errorMsg}</Text>}
      {!canCall ? (
        <Text style={styles.emptyText}>Calls are unavailable for {consultation?.status} consultations</Text>
      ) : (
        <View style={{ flexDirection: 'row', gap: Spacing[2] }}>
          <TouchableOpacity style={styles.callOptionBtn} onPress={() => call.startCall('video')}>
            <View style={styles.callOptionIcon}><Ionicons name="videocam" size={20} color={Colors.primary} /></View>
            <Text style={styles.callOptionLabel}>Video Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.callOptionBtn, styles.callOptionBtnBlue]} onPress={() => phone ? Linking.openURL(`tel:${phone}`) : call.startCall('audio')}>
            <View style={styles.callOptionIcon}><Ionicons name="call" size={20} color={Colors.infoDark} /></View>
            <Text style={[styles.callOptionLabel, { color: Colors.infoDark }]}>{phone ? 'Call (Phone)' : 'Audio Call'}</Text>
          </TouchableOpacity>
        </View>
      )}
      {!!specialist?.whatsapp_number && (
        <TouchableOpacity style={styles.whatsappBtn} onPress={() => Linking.openURL(`https://wa.me/${specialist.whatsapp_number.replace(/\D/g, '')}`)}>
          <Text style={styles.whatsappText}>💬 WhatsApp</Text>
        </TouchableOpacity>
      )}
    </Card>
  );
}

// ─── Chat panel — polls messages every 5s ───────────────────────────────────────
function ChatPanel({ consultationId, user }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchMessages = () => {
      consultationsApi.messages.list(consultationId)
        .then(({ data }) => { if (active) { setMessages(Array.isArray(data) ? data : (data.results || [])); setLoaded(true); } })
        .catch(() => {});
    };
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => { active = false; clearInterval(interval); };
  }, [consultationId]);

  const handleSend = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      const { data } = await consultationsApi.messages.send(consultationId, text.trim());
      setMessages((m) => [...m, data]);
      setText('');
    } catch { /* keep text so the user can retry */ }
    finally { setSending(false); }
  };

  return (
    <View style={styles.chatCard}>
      <View style={styles.chatHeader}>
        <Ionicons name="chatbubbles-outline" size={16} color="#7c3aed" />
        <Text style={styles.cardTitleText}>Chat</Text>
        <Text style={styles.chatPollText}>Auto-refreshes every 5s</Text>
      </View>
      <ScrollView style={styles.chatBody} contentContainerStyle={{ padding: Spacing[3], gap: Spacing[2] }}>
        {loaded && messages.length === 0 && <Text style={styles.emptyText}>No messages yet. Start the conversation.</Text>}
        {messages.map((m) => {
          const isMe = m.sender === user?.id;
          return (
            <View key={m.id} style={[styles.msgRow, isMe && styles.msgRowMe]}>
              <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                {!isMe && <Text style={styles.bubbleSender}>{m.sender_name}</Text>}
                <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{m.body}</Text>
                <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>{fmtTime(m.created_at)}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
        <View style={styles.chatInputRow}>
          <TextInput style={styles.chatInput} value={text} onChangeText={setText} placeholder="Type a message…" />
          <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={sending || !text.trim()}>
            <Ionicons name="send" size={16} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function StatusUpdateModal({ visible, onClose, consultation, onUpdated }) {
  const [status, setStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const voiceFields = [{ key: 'notes', label: 'Notes', get: () => notes, set: setNotes }];
  const voiceEntry = useVoiceEntry(voiceFields);

  React.useEffect(() => { if (visible) { setStatus(''); setNotes(''); setError(''); } }, [visible]);

  const handleSubmit = async () => {
    if (!status) return;
    setSaving(true); setError('');
    try {
      const payload = { status };
      if (notes) payload.notes = notes;
      const { data } = await consultationsApi.updateStatus(consultation.id, payload);
      onUpdated(data);
    } catch {
      setError('Failed to update status.');
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Update Consultation">
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <Select label="Action" required value={status} onValueChange={setStatus} placeholder="— Select —" options={STATUS_OPTIONS} />
      <VoiceEntryTrigger onPress={voiceEntry.start} count={voiceFields.length} />
      <Input label="Notes" value={notes} onChangeText={setNotes} multiline numberOfLines={3} placeholder="Clinical notes, findings, recommendations…" />
      <View style={styles.modalActions}>
        <Button title="Cancel" variant="outline" onPress={onClose} style={{ flex: 1 }} />
        <Button title="Confirm" onPress={handleSubmit} loading={saving} disabled={!status} style={{ flex: 1 }} />
      </View>
      <VoiceEntryBar voiceEntry={voiceEntry} />
    </Modal>
  );
}

function EditNotesModal({ visible, onClose, consultation, onUpdated }) {
  const [notes, setNotes] = useState(consultation?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const voiceFields = [{ key: 'notes', label: 'Clinical Notes', get: () => notes, set: setNotes }];
  const voiceEntry = useVoiceEntry(voiceFields);

  React.useEffect(() => { if (visible) setNotes(consultation?.notes || ''); }, [visible, consultation]);

  const handleSubmit = async () => {
    setSaving(true); setError('');
    try {
      const { data } = await consultationsApi.updateStatus(consultation.id, { notes });
      onUpdated(data);
    } catch {
      setError('Failed to update consultation.');
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Edit Consultation">
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <VoiceEntryTrigger onPress={voiceEntry.start} count={voiceFields.length} />
      <Input label="Clinical Notes" value={notes} onChangeText={setNotes} multiline numberOfLines={4} placeholder="Clinical findings, recommendations…" />
      <View style={styles.modalActions}>
        <Button title="Cancel" variant="outline" onPress={onClose} style={{ flex: 1 }} />
        <Button title="Save Changes" icon="save-outline" onPress={handleSubmit} loading={saving} style={{ flex: 2 }} />
      </View>
      <VoiceEntryBar voiceEntry={voiceEntry} />
    </Modal>
  );
}

function DeleteModal({ visible, onClose, consultation, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setDeleting(true); setError('');
    try {
      await consultationsApi.delete(consultation.id);
      onDeleted();
    } catch {
      setError('Failed to delete. This consultation may have related records.');
      setDeleting(false);
    }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Delete Consultation?">
      <Text style={styles.deleteBody}>This cannot be undone. All messages will be lost.</Text>
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <View style={styles.modalActions}>
        <Button title="Cancel" variant="outline" onPress={onClose} style={{ flex: 1 }} />
        <Button title="Yes, Delete" variant="danger" onPress={handleDelete} loading={deleting} style={{ flex: 1 }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[4], paddingTop: Spacing[5], paddingBottom: Spacing[3],
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: Typography.md, fontWeight: Typography.semibold, color: Colors.textPrimary },
  cardLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.gray400, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing[2] },
  cardTitleText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  notesBox: { fontSize: Typography.sm, color: Colors.textPrimary, backgroundColor: Colors.primaryLight, borderRadius: Radius.md, padding: Spacing[3], lineHeight: 20 },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  kvKey: { fontSize: Typography.xs, color: Colors.gray400 },
  kvVal: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textPrimary },
  viewLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: Spacing[3] },
  viewLinkText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.primaryDark },
  emptyText: { fontSize: Typography.sm, color: Colors.gray400, textAlign: 'center', paddingVertical: Spacing[3] },
  callOptionBtn: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14, backgroundColor: Colors.primaryLight, borderWidth: 1.5, borderColor: Colors.successLight, borderRadius: Radius.lg },
  callOptionBtnBlue: { backgroundColor: Colors.infoLight, borderColor: Colors.infoLight },
  callOptionIcon: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', ...Shadow.sm },
  callOptionLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.primaryDark },
  whatsappBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: Spacing[2], padding: 10, backgroundColor: Colors.successLight, borderRadius: Radius.md },
  whatsappText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.successDark },
  callActiveCard: { backgroundColor: '#0f172a', borderRadius: Radius.lg, overflow: 'hidden' },
  callActiveHeader: { padding: Spacing[6], alignItems: 'center' },
  callAvatar: { width: 64, height: 64, borderRadius: Radius.full, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing[2] },
  callName: { color: Colors.white, fontWeight: Typography.semibold, fontSize: Typography.md },
  callSub: { color: '#94a3b8', fontSize: Typography.xs, marginTop: 2 },
  videoContainer: { width: '100%', height: 200, backgroundColor: '#1e293b', borderRadius: Radius.md, overflow: 'hidden', marginTop: Spacing[3], position: 'relative', alignItems: 'center', justifyContent: 'center' },
  remoteVideo: { width: '100%', height: '100%' },
  localVideo: { position: 'absolute', bottom: 8, right: 8, width: 76, height: 58, borderRadius: 8, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  waitingText: { color: '#64748b', fontSize: Typography.xs },
  callError: { color: '#fca5a5', fontSize: Typography.xs, marginTop: Spacing[2], textAlign: 'center' },
  callErrorIdle: { color: Colors.dangerDark, fontSize: Typography.xs, backgroundColor: Colors.dangerLight, borderRadius: Radius.md, padding: Spacing[2], marginBottom: Spacing[3] },
  callControls: { flexDirection: 'row', justifyContent: 'center', gap: Spacing[4], paddingVertical: Spacing[4], backgroundColor: Colors.white },
  callBtn: { width: 44, height: 44, borderRadius: Radius.full, backgroundColor: Colors.gray100, alignItems: 'center', justifyContent: 'center' },
  callBtnActive: { backgroundColor: Colors.dangerLight },
  callEndBtn: { width: 52, height: 52, borderRadius: Radius.full, backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center' },
  chatCard: { backgroundColor: Colors.white, borderRadius: Radius.lg, height: 380, overflow: 'hidden', ...Shadow.sm },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  chatPollText: { fontSize: 10, color: Colors.gray400, marginLeft: 'auto' },
  chatBody: { flex: 1 },
  msgRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  msgRowMe: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', borderRadius: Radius.lg, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleThem: { backgroundColor: Colors.gray100, borderBottomLeftRadius: 4 },
  bubbleMe: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleSender: { fontSize: 10, fontWeight: Typography.bold, color: Colors.gray400, marginBottom: 2 },
  bubbleText: { fontSize: Typography.sm, color: Colors.textPrimary },
  bubbleTextMe: { color: Colors.white },
  bubbleTime: { fontSize: 10, color: Colors.gray400, marginTop: 3 },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.7)' },
  chatInputRow: { flexDirection: 'row', gap: 8, padding: Spacing[3], borderTopWidth: 1, borderTopColor: Colors.gray100 },
  chatInput: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 8, fontSize: Typography.sm },
  sendBtn: { width: 38, height: 38, borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  modalActions: { flexDirection: 'row', gap: Spacing[2], marginTop: Spacing[3] },
  deleteBody: { fontSize: Typography.sm, color: Colors.textSecondary, marginBottom: Spacing[2] },
});
