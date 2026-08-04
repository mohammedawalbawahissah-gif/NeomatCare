/**
 * src/services/voice.js
 *
 * Mirrors neomatcare-frontend/src/services/voice.js — same LANGUAGES list,
 * same provider split, same function shapes. What differs is only what
 * each platform substitutes for "on-device":
 *
 *   Web English TTS  → window.speechSynthesis        | Mobile → expo-speech
 *   Web English STT   → browser SpeechRecognition      | Mobile → @react-native-voice/voice
 *   Non-English (both)→ record audio, POST to Django, which proxies to
 *                        Khaya AI / Google Cloud STT — identical on both platforms.
 *
 * IMPORTANT: @react-native-voice/voice is a native module. It requires an
 * EAS/dev-client rebuild (config plugin in app.json) — it will NOT work in
 * Expo Go. This app already builds via EAS (see eas.json), so that's just
 * "rebuild before this works," not a new constraint on the project.
 */
import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../api/client';

export const LANGUAGES = [
  { code: 'en',  label: 'English',           dictation: true,  readAloud: true },
  { code: 'tw',  label: 'Twi',               dictation: true,  readAloud: true },
  { code: 'dag', label: 'Dagbani',           dictation: true,  readAloud: true },
  { code: 'ee',  label: 'Ewe',               dictation: true,  readAloud: true },
  { code: 'gaa', label: 'Ga',                dictation: true,  readAloud: true },
  { code: 'gur', label: 'Frafra (Gurune)',   dictation: true,  readAloud: true },
  { code: 'ha',  label: 'Hausa',             dictation: true,  readAloud: false },
];

const VOICE_LANG_KEY = 'nmc_voice_language';
let cachedLang = 'en';
AsyncStorage.getItem(VOICE_LANG_KEY).then((v) => { if (v) cachedLang = v; }).catch(() => {});

/** Synchronous read from an in-memory cache (AsyncStorage itself is async) — same call shape as the web version's localStorage read. */
export function getVoiceLanguage() {
  return cachedLang;
}

export async function setVoiceLanguage(code) {
  cachedLang = code;
  await AsyncStorage.setItem(VOICE_LANG_KEY, code).catch(() => {});
}

// ── Text-to-speech ──────────────────────────────────────────────────────────

let currentSound = null;

/**
 * @param {string} text
 * @param {string} lang
 * @returns {Promise<void>} resolves when playback finishes
 */
export async function speak(text, lang) {
  if (!text?.trim()) return;

  if (lang === 'en') {
    return new Promise((resolve, reject) => {
      Speech.stop();
      Speech.speak(text, {
        language: 'en-US',
        onDone: resolve,
        onStopped: resolve,
        onError: (err) => reject(err instanceof Error ? err : new Error('Speech synthesis failed.')),
      });
    });
  }

  // Non-English: fetch synthesized audio from the backend, write it to a
  // temp file (expo-av plays from a file/URI, not raw bytes), then play it.
  const { data } = await apiClient.post(
    '/api/voice/synthesize/',
    { text, lang },
    { responseType: 'arraybuffer' }
  );
  const base64 = arrayBufferToBase64(data);
  const fileUri = `${FileSystem.cacheDirectory}nmc_tts_${Date.now()}.mp3`;
  await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });

  if (currentSound) {
    try { await currentSound.unloadAsync(); } catch {}
  }
  const { sound } = await Audio.Sound.createAsync({ uri: fileUri }, { shouldPlay: true });
  currentSound = sound;
  return new Promise((resolve, reject) => {
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.didJustFinish) { sound.unloadAsync(); resolve(); }
      if (status.error) reject(new Error('Could not play audio.'));
    });
  });
}

export function stopSpeaking() {
  Speech.stop();
  if (currentSound) currentSound.stopAsync().catch(() => {});
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000; // avoid call-stack limits on String.fromCharCode with large arrays
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  // global.btoa exists in the Hermes/RN runtime; fall back to a manual
  // encoder only if it doesn't (older engines).
  return typeof btoa === 'function' ? btoa(binary) : base64EncodeFallback(bytes);
}

function base64EncodeFallback(bytes) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i], b2 = bytes[i + 1], b3 = bytes[i + 2];
    result += chars[b1 >> 2];
    result += chars[((b1 & 3) << 4) | (b2 >> 4 || 0)];
    result += i + 1 < bytes.length ? chars[((b2 & 15) << 2) | (b3 >> 6 || 0)] : '=';
    result += i + 2 < bytes.length ? chars[b3 & 63] : '=';
  }
  return result;
}

// ── Speech-to-text ──────────────────────────────────────────────────────────

let Voice = null;
try {
  // Lazy/optional require so the app doesn't crash on import in an
  // Expo-Go-only environment where the native module isn't linked yet.
  Voice = require('@react-native-voice/voice').default;
} catch {
  Voice = null;
}

/** English dictation via the on-device OS speech recognizer. */
function listenNative(lang, { onResult, onError, onEnd }) {
  if (!Voice) {
    onError?.(new Error('Dictation needs a rebuilt app (native module not available in Expo Go).'));
    return () => {};
  }
  Voice.onSpeechResults = (e) => onResult?.(e.value?.[0] || '');
  Voice.onSpeechError = (e) => onError?.(new Error(e.error?.message || 'Dictation error.'));
  Voice.onSpeechEnd = () => onEnd?.();
  Voice.start('en-US').catch((err) => onError?.(err));

  const stop = () => { Voice.stop().catch(() => {}); };
  stop.cancel = () => { Voice.cancel().catch(() => {}); };
  return stop;
}

/**
 * Local-language dictation: record with expo-av, upload the clip to the
 * backend on stop, get back a transcript. Record-then-transcribe, same as
 * the web version's MediaRecorder path — no interim results.
 */
function listenViaBackend(lang, { onResult, onError, onEnd }) {
  let recording = null;
  let cancelled = false;

  (async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) throw new Error('Microphone access is required for dictation.');
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error('Could not start recording.'));
    }
  })();

  const finish = async () => {
    if (!recording) { onEnd?.(); return; }
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (cancelled || !uri) { onEnd?.(); return; }

      const form = new FormData();
      form.append('audio', { uri, name: 'dictation.m4a', type: 'audio/m4a' });
      form.append('lang', lang);
      const { data } = await apiClient.post('/api/voice/transcribe/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onResult?.(data.text || '');
    } catch (err) {
      onError?.(new Error(err?.response?.data?.error || 'Could not transcribe audio.'));
    } finally {
      onEnd?.();
    }
  };

  const stop = () => { finish(); };
  stop.cancel = () => { cancelled = true; finish(); };
  return stop;
}

/**
 * Start listening. Returns a stop function; stopFn.cancel() discards
 * instead of transcribing/finalizing (same contract as the web service).
 * @param {string} lang
 * @param {{onResult?: (text: string) => void, onError?: (err: Error) => void, onEnd?: () => void}} handlers
 */
export function startListening(lang, handlers) {
  return lang === 'en' ? listenNative(lang, handlers) : listenViaBackend(lang, handlers);
}
