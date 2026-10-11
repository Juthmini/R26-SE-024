import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import {
  AudioPlayer,
  AudioRecorder,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';

export const AI_URL = process.env.EXPO_PUBLIC_AI_URL || 'http://172.20.10.3:8000';

export type Lang = 'si' | 'en';

export interface Detection {
  label: string;
  label_si: string;
  confidence: number;
  box: [number, number, number, number]; // normalized x1,y1,x2,y2
}

export interface SeenThing {
  label: string;
  label_si: string;
  photo_url: string;
  lat?: number | null;
  lng?: number | null;
  room?: string | null;
  room_si?: string | null;
  anchors?: string[];
  time: string;
  when_si?: string;
  say_si?: string;
  times_seen?: number;
  familiar?: boolean;     // matched this patient's own earlier sightings ("your usual cup")
  gallery_size?: number;
}

export interface Person {
  id: string;
  name: string;
  relation: string;
  relation_si: string;
  photo_url: string;
  last_seen?: string;
  times_met?: number;
  face_samples?: number; // size of the adaptive face gallery
  status?: 'verified' | 'pending';
  created?: string;
  enrolled?: boolean;     // registered by the caregiver (vs. learned from an answer)
  said?: string;
  conversation_ok?: boolean; // family member agreed that visit conversations may be summarised
}

export interface FamilyAlert {
  id: string;
  kind: 'identity_mismatch' | 'unknown_visitor';
  claimed_si: string;
  claimed_name?: string;
  registered_name?: string;
  similarity?: number;
  said?: string;
  photo_url: string;
  time: string;
  seen: boolean;
}

export interface CameraSource {
  source: 'phone' | 'esp32';
  esp32Ip: string;
  room: string;
}

const CAMERA_KEY = 'memory_camera_source';

export async function getPatientId(): Promise<string | null> {
  const stored = await AsyncStorage.getItem('patient');
  if (!stored) return null;
  const p = JSON.parse(stored);
  // The real Mongo id, never the human-readable customerCode (see FindMyThingsScanUI).
  return p.id || p._id || null;
}

export async function getPatientName(): Promise<string> {
  const stored = await AsyncStorage.getItem('patient');
  if (!stored) return '';
  const p = JSON.parse(stored);
  return p.firstName || p.name || '';
}

export async function loadCameraSource(): Promise<CameraSource> {
  try {
    const raw = await AsyncStorage.getItem(CAMERA_KEY);
    if (raw) return { source: 'phone', esp32Ip: '', room: '', ...JSON.parse(raw) };
  } catch {}
  return { source: 'phone', esp32Ip: '', room: '' };
}

export async function saveCameraSource(cfg: CameraSource) {
  await AsyncStorage.setItem(CAMERA_KEY, JSON.stringify(cfg));
}

// ─── Voice out ────────────────────────────────────────────────────────────
// Sinhala is spoken by the AI server (gTTS) rather than expo-speech: iOS has no
// Sinhala system voice, so on-device speech would be silent or garbled.
let currentPlayer: AudioPlayer | null = null;

export function stopSpeaking() {
  if (currentPlayer) {
    try {
      currentPlayer.pause();
      currentPlayer.remove();
    } catch {}
    currentPlayer = null;
  }
}

export async function speak(text: string, lang: Lang = 'si'): Promise<void> {
  if (!text) return;
  stopSpeaking();
  // allowsRecording must be off for playback, or iOS routes audio to the quiet earpiece.
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
  const player = createAudioPlayer({
    uri: `${AI_URL}/tts?lang=${lang}&text=${encodeURIComponent(text)}`,
  });
  currentPlayer = player;

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      sub.remove();
      if (currentPlayer === player) stopSpeaking();
      resolve();
    };
    // addListener comes from expo's SharedObject base class, whose type doesn't
    // resolve in this project's TS setup - it exists at runtime.
    const sub = (player as any).addListener('playbackStatusUpdate', (s: { didJustFinish?: boolean }) => {
      if (s.didJustFinish) finish();
    });
    player.play();
    // Safety net in case the finish event never arrives (network hiccup).
    setTimeout(finish, 4000 + text.length * 140);
  });
}

// ─── Voice in ─────────────────────────────────────────────────────────────
export interface VoiceMeaning {
  text: string;
  intent: 'find' | 'introduce' | 'other';
  object?: string;
  relation?: string;
  relation_si?: string;
  name?: string;
}

export async function startListening(recorder: AudioRecorder) {
  const perm = await requestRecordingPermissionsAsync();
  if (!perm.granted) throw new Error('Microphone permission denied');
  stopSpeaking();
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
  await recorder.prepareToRecordAsync();
  recorder.record();
}

export async function stopAndUnderstand(recorder: AudioRecorder, patientId: string, lang: Lang = 'si'): Promise<VoiceMeaning> {
  await recorder.stop();
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
  const uri = recorder.uri;
  if (!uri) throw new Error('Nothing was recorded');

  const form = new FormData();
  form.append('file', { uri, name: 'voice.m4a', type: 'audio/m4a' } as any);
  form.append('lang', lang);
  form.append('patient_id', patientId);
  const res = await axios.post(`${AI_URL}/transcribe`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 40000,
  });
  if (res.data.status !== 'success') throw new Error(res.data.message || 'Could not understand');
  return res.data;
}

// ─── Caregiver session (family registration is PIN-protected) ────────────
// Kept in memory only, for a few minutes, so the PIN isn't re-typed on every
// screen but also never sits on the device where the patient could reuse it.
let caregiverPin: { pin: string; until: number } | null = null;
const CAREGIVER_SESSION_MS = 10 * 60 * 1000;

export function setCaregiverPin(pin: string) {
  caregiverPin = { pin, until: Date.now() + CAREGIVER_SESSION_MS };
}
export function getCaregiverPin(): string | null {
  if (!caregiverPin || Date.now() > caregiverPin.until) return null;
  return caregiverPin.pin;
}
export function clearCaregiverPin() {
  caregiverPin = null;
}

export const RELATIONS: { en: string; si: string; emoji: string }[] = [
  { en: 'son', si: 'පුතා', emoji: '👦' },
  { en: 'daughter', si: 'දුව', emoji: '👧' },
  { en: 'wife', si: 'බිරිඳ', emoji: '👩' },
  { en: 'husband', si: 'සැමියා', emoji: '👨' },
  { en: 'grandson', si: 'මුණුබුරා', emoji: '🧒' },
  { en: 'granddaughter', si: 'මිනිබිරිය', emoji: '👧' },
  { en: 'elder brother', si: 'අයියා', emoji: '🧔' },
  { en: 'younger brother', si: 'මල්ලි', emoji: '👱' },
  { en: 'elder sister', si: 'අක්කා', emoji: '👩‍🦱' },
  { en: 'younger sister', si: 'නංගි', emoji: '👱‍♀️' },
  { en: 'mother', si: 'අම්මා', emoji: '👵' },
  { en: 'father', si: 'තාත්තා', emoji: '👴' },
  { en: 'friend', si: 'යාළුවා', emoji: '🤝' },
  { en: 'nurse', si: 'හෙදිය', emoji: '🧑‍⚕️' },
  { en: 'doctor', si: 'දොස්තර', emoji: '🩺' },
];

// ─── Nightly memory story reminder ───────────────────────────────────────
const STORY_NOTIF_ID = 'memocare-nightly-story';
export const STORY_HOUR = 20; // matches the AI server's STORY_HOUR default

/** Local daily notification at STORY_HOUR - the server writes the story at the
 *  same hour, so tapping it opens a ready story. Local notifications work in
 *  Expo Go (only remote push was removed), so no dev build is needed. */
export async function scheduleNightlyStory() {
  try {
    // Lazy require: importing expo-notifications at module scope triggers push
    // registration, which errors in Expo Go (see backgroundAlerts.ts).
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return;
    await Notifications.cancelScheduledNotificationAsync(STORY_NOTIF_ID).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: STORY_NOTIF_ID,
      content: {
        title: '🌙 අද ඔබේ මතක කතාව',
        body: 'ඔබේ දවසේ ලස්සන කතාව සූදානම්. අහන්න ඔබන්න.',
        data: { url: '/patient/memory-story' },
        sound: true,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: STORY_HOUR, minute: 0 },
    });
  } catch {
    // Notifications are a nice-to-have; the story is still in the app.
  }
}

// ─── Geometry helpers for "where is it" ──────────────────────────────────
export function distanceMetres(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearingDegrees(lat1: number, lon1: number, lat2: number, lon2: number) {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Direction relative to where the phone is pointing, in plain Sinhala/English. */
export function relativeDirection(bearing: number, heading: number | null, lang: Lang = 'si') {
  if (heading == null) return lang === 'si' ? 'ඒ පැත්තට' : 'that way';
  const rel = (bearing - heading + 360) % 360;
  if (rel < 30 || rel > 330) return lang === 'si' ? 'ඉස්සරහට' : 'straight ahead';
  if (rel < 150) return lang === 'si' ? 'දකුණු පැත්තට' : 'to your right';
  if (rel < 210) return lang === 'si' ? 'පිටිපස්සට' : 'behind you';
  return lang === 'si' ? 'වම් පැත්තට' : 'to your left';
}

export function timeAgo(iso: string, lang: Lang = 'si') {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (lang === 'en') {
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
    return `${Math.round(mins / 1440)} days ago`;
  }
  if (mins < 1) return 'දැන්';
  if (mins < 60) return `විනාඩි ${mins}කට කලින්`;
  if (mins < 1440) return `පැය ${Math.round(mins / 60)}කට කලින්`;
  return `දින ${Math.round(mins / 1440)}කට කලින්`;
}
