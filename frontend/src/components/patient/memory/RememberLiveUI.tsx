import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import axios from 'axios';
import Svg, { Circle } from 'react-native-svg';
import { RecordingPresets, useAudioRecorder } from 'expo-audio';
import {
  AI_URL, CameraSource, Detection, getPatientId, loadCameraSource, speak, startListening,
  stopAndUnderstand, stopSpeaking,
} from '../../../services/memoryAI';

// A thing or a person counts as "interacted with" once it stays in view this long.
const DWELL_MS = 30000;
const PERSON_DWELL_MS = 30000;
// Pause between announcing "I'm remembering X" and actually saving, so the
// patient hears what's about to be kept before it happens.
const SAVE_DELAY_MS = 2000;
const RESAVE_COOLDOWN_MS = 2 * 60 * 1000;
const NO_FACE_RETRY_MS = 6000;
// How often the silent "is this someone we know?" check repeats while an
// unrecognised person is in view (their face may turn toward the camera later).
const QUICK_CHECK_EVERY_MS = 3000;
const MISSES_BEFORE_RESET = 3;
const PERSON_MISSES_BEFORE_LEAVE = 4;
const LISTEN_MS = 5000;
const MIN_CONF = 0.5;
// Furniture and fittings never start a countdown by themselves - they're kept
// by the server only as "near the sink" style location clues.
const FIXED = new Set(['sink', 'oven', 'refrigerator', 'microwave', 'bed', 'couch', 'toilet',
  'dining table', 'tv', 'chair', 'potted plant']);

const PALETTE = ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444', '#eab308'];
const colorFor = (label: string) => PALETTE[[...label].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];

const SCREEN_W = Dimensions.get('window').width;
const VIEW_W = SCREEN_W - 24;

type Phase = 'watching' | 'saving' | 'asking' | 'listening' | 'thinking';
type Toast = { text: string; photo?: string; tone: 'ok' | 'info' | 'warn' };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function RememberLiveUI() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const [cam, setCam] = useState<CameraSource | null>(null);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [aspect, setAspect] = useState(3 / 4); // width / height of the analysed frame
  const [espFrame, setEspFrame] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('watching');
  const [progress, setProgress] = useState(0); // 0..1 of the dwell countdown
  const [engaged, setEngaged] = useState<string[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [offline, setOffline] = useState(false);
  const [paused, setPaused] = useState(false);
  const [listenLeft, setListenLeft] = useState(0);
  const [askRetry, setAskRetry] = useState(false);
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);

  // Small frames are the biggest speed win: a full 12MP photo is slow to take
  // and to upload, and the detector only looks at ~640px anyway.
  const onCameraReady = useCallback(async () => {
    try {
      const sizes = (await cameraRef.current?.getAvailablePictureSizesAsync()) || [];
      const pick = ['640x480', '1280x720', 'Medium', 'Low'].find((s) => sizes.includes(s));
      if (pick) setPictureSize(pick);
    } catch {}
  }, []);

  const mounted = useRef(true);
  const busy = useRef(false); // true while saving / asking - the camera loop idles
  const pausedRef = useRef(false);
  const dwell = useRef<{ start: number; counts: Record<string, number>; frames: number; misses: number; labelSi: Record<string, string> } | null>(null);
  const lastSaved = useRef<{ key: string; at: number } | null>(null);
  const pendingFace = useRef<string | null>(null);
  // One continuous visit of a person in front of the camera.
  const visit = useRef<{ start: number; lastSeen: number; misses: number; checkedAt: number; personId: string | null; done: boolean } | null>(null);
  const [personProgress, setPersonProgress] = useState(0);
  // Shown on the person's box instead of "පුද්ගලයා": who they are, or that they're unknown.
  const [personTag, setPersonTag] = useState<{ text: string; color: string } | null>(null);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      setCam(await loadCameraSource());
      setPatientId(await getPatientId());
      await Location.requestForegroundPermissionsAsync();
    })();
    return () => {
      mounted.current = false;
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const showToast = (t: Toast, ms = 3500) => {
    setToast(t);
    setTimeout(() => mounted.current && setToast((cur) => (cur === t ? null : cur)), ms);
  };

  const resetDwell = () => {
    dwell.current = null;
    setProgress(0);
    setEngaged([]);
  };

  const getPosition = async () => {
    try {
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        sleep(5000).then(() => null),
      ]);
      const p = pos || (await Location.getLastKnownPositionAsync());
      return p ? { lat: p.coords.latitude, lng: p.coords.longitude } : null;
    } catch {
      return null;
    }
  };

  // ─── Saving a moment ─────────────────────────────────────────────────
  const saveMoment = useCallback(async (labels: string[]) => {
    if (!patientId || !cam) return;
    busy.current = true;
    setPhase('saving');

    try {
      const pos = await getPosition();
      const buildForm = (preview: boolean) => {
        const form = new FormData();
        form.append('patient_id', patientId);
        form.append('labels', JSON.stringify(labels));
        form.append('source', cam.source);
        form.append('dwell_seconds', String(DWELL_MS / 1000));
        form.append('preview', preview ? 'true' : 'false');
        if (pos) {
          form.append('lat', String(pos.lat));
          form.append('lng', String(pos.lng));
        }
        if (cam.source === 'esp32' && cam.room) form.append('room', cam.room);
        return form;
      };
      const post = (preview: boolean) => axios.post(`${AI_URL}/save-moment`, buildForm(preview), {
        headers: { 'Content-Type': 'multipart/form-data' }, timeout: 45000,
      });
      lastSaved.current = { key: [...labels].sort().join('|'), at: Date.now() };

      // Ask first what would actually be new - things already remembered in this
      // same place aren't announced or saved again (only their time is refreshed).
      const pv = (await post(true)).data;
      if (pv.status !== 'success') throw new Error(pv.message);
      if (!pv.new.length && !pv.moved.length) {
        await post(false);
        showToast({ text: 'මේවා දැනටමත් මතකයි ✓', tone: 'info' }, 2500);
        return;
      }

      await speak(pv.say_si);
      await sleep(SAVE_DELAY_MS);
      const res = (await post(false)).data;
      if (res.status !== 'success') throw new Error(res.message);
      showToast({ text: res.say_si, photo: res.moment?.photo_urls?.[0], tone: 'ok' }, 5000);
    } catch (e: any) {
      showToast({ text: 'සුරකින්න බැරි වුණා. ආයෙත් උත්සාහ කරනවා.', tone: 'warn' });
    } finally {
      resetDwell();
      busy.current = false;
      if (mounted.current) setPhase('watching');
    }
  }, [patientId, cam]);

  // ─── People ──────────────────────────────────────────────────────────
  const listenForName = useCallback(async () => {
    if (!patientId || !pendingFace.current) return;
    setAskRetry(false);
    setPhase('listening');
    try {
      await startListening(recorder);
      for (let s = LISTEN_MS / 1000; s > 0; s--) {
        if (!mounted.current) return;
        setListenLeft(s);
        await sleep(1000);
      }
      setListenLeft(0);
      setPhase('thinking');
      const meaning = await stopAndUnderstand(recorder, patientId);
      if (!meaning.relation && !meaning.name) throw new Error('not understood');

      const form = new FormData();
      form.append('patient_id', patientId);
      form.append('pending_id', pendingFace.current);
      form.append('answer_text', meaning.text || '');
      form.append('relation', meaning.relation || '');
      form.append('name', meaning.name || '');
      const res = await axios.post(`${AI_URL}/save-person`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }, timeout: 30000,
      });
      if (res.data.status !== 'success') throw new Error(res.data.message);
      pendingFace.current = null;
      const result: 'verified' | 'pending' | 'rejected' = res.data.result;
      // Only a face-verified person's visit counts toward "time with your son" in the story.
      if (visit.current && result === 'verified') visit.current.personId = res.data.person.id;
      showToast({
        text: res.data.say_si,
        photo: res.data.person?.photo_url || res.data.alert?.photo_url,
        tone: result === 'verified' ? 'ok' : result === 'rejected' ? 'warn' : 'info',
      }, 6000);
      await speak(res.data.say_si);
      busy.current = false;
      setPhase('watching');
    } catch {
      await speak('සමාවෙන්න, තේරුණේ නැහැ. ආයෙත් කියන්න.');
      setAskRetry(true);
      setPhase('asking');
    }
  }, [patientId, recorder]);

  const skipPerson = () => {
    pendingFace.current = null;
    setAskRetry(false);
    busy.current = false; // visit stays "done", so we don't ask again until they leave and come back
    setPhase('watching');
  };

  // When a recognised person walks out of view, tell the server how long the
  // visit was - that's what the end-of-day story uses ("about 6 minutes").
  const endVisit = useCallback(() => {
    const v = visit.current;
    visit.current = null;
    setPersonProgress(0);
    setPersonTag(null);
    if (!v?.personId || !patientId) return;
    const form = new FormData();
    form.append('patient_id', patientId);
    form.append('kind', 'person');
    form.append('ref', v.personId);
    form.append('seconds', String(Math.round((v.lastSeen - v.start) / 1000)));
    axios.post(`${AI_URL}/log-interaction`, form, {
      headers: { 'Content-Type': 'multipart/form-data' }, timeout: 10000,
    }).catch(() => {});
  }, [patientId]);

  // ask=false: instant, silent check run as soon as someone appears - known
  // family are greeted immediately; unknown faces are only labelled.
  // ask=true: after PERSON_DWELL_MS with an unknown face - "who is this?".
  const checkPerson = useCallback(async (ask: boolean) => {
    if (!patientId || !visit.current) return;
    const v = visit.current;
    v.checkedAt = Date.now();
    try {
      const form = new FormData();
      form.append('patient_id', patientId);
      form.append('ask', ask ? 'true' : 'false');
      const res = await axios.post(`${AI_URL}/identify-person`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }, timeout: 20000,
      });
      const d = res.data;
      if (visit.current !== v) return; // they left while we were checking
      if (d.status === 'known') {
        v.done = true;
        v.personId = d.person.id;
        const who = d.person.name && d.person.name !== d.person.relation_si ? ` ${d.person.name}` : '';
        setPersonTag({ text: `${d.person.relation_si}${who} ✓`, color: '#16a34a' });
        setPersonProgress(0);
        showToast({ text: d.say_si, photo: d.person.photo_url, tone: 'info' }, 4500);
        speak(d.say_si);
      } else if (d.status === 'pending_known') {
        v.done = true; // seen before but not yet approved by the caregiver - don't ask again
        setPersonTag({ text: 'තහවුරු කර නැති කෙනෙක්', color: '#d97706' });
        setPersonProgress(0);
        showToast({ text: d.say_si, photo: d.person.photo_url, tone: 'warn' }, 4500);
        speak(d.say_si);
      } else if (d.status === 'unknown_silent') {
        setPersonTag({ text: 'නොදන්නා කෙනෙක්', color: '#dc2626' });
      } else if (d.status === 'unknown' && !busy.current) {
        setPersonTag({ text: 'නොදන්නා කෙනෙක්', color: '#dc2626' });
        v.done = true;
        busy.current = true;
        pendingFace.current = d.pending_id;
        resetDwell();
        setPersonProgress(0);
        setPhase('asking');
        await speak(d.say_si);
        await listenForName();
      } else if (d.status === 'unavailable') {
        v.done = true;
        setPersonProgress(0);
      }
      // no_face / no_person: leave the visit open and retry shortly.
    } catch {
      // Face check is best-effort; the object loop carries on regardless.
    }
  }, [patientId, listenForName]);

  // ─── Per-frame dwell tracking ────────────────────────────────────────
  const onFrame = useCallback((dets: Detection[]) => {
    const now = Date.now();
    const movable = dets.filter((d) => d.confidence >= MIN_CONF && d.label !== 'person' && !FIXED.has(d.label));
    const labels = [...new Set(movable.map((d) => d.label))];

    // A person close enough to be interacting (not someone far in the background).
    const person = dets.find((d) => {
      const [x1, y1, x2, y2] = d.box;
      return d.label === 'person' && d.confidence >= 0.6 && (x2 - x1) * (y2 - y1) >= 0.06;
    });
    if (person) {
      if (!visit.current) {
        visit.current = { start: now, lastSeen: now, misses: 0, checkedAt: 0, personId: null, done: false };
        setPersonTag(null);
      }
      const v = visit.current;
      v.lastSeen = now;
      v.misses = 0;
      const together = now - v.start;
      if (!v.done && !busy.current && now - v.checkedAt > QUICK_CHECK_EVERY_MS) {
        if (together >= PERSON_DWELL_MS) {
          checkPerson(true); // stayed 30s and still unknown -> ask who they are
        } else {
          checkPerson(false); // instant recognition attempt, repeated while their face gets clearer
        }
      }
      // The countdown ring only makes sense for someone we don't recognise yet.
      if (!v.done) setPersonProgress(Math.min(1, together / PERSON_DWELL_MS));
    } else if (visit.current) {
      visit.current.misses += 1;
      if (visit.current.misses >= PERSON_MISSES_BEFORE_LEAVE) endVisit();
    }

    const d = dwell.current;
    const overlaps = d && labels.some((l) => d.counts[l]);
    if (!labels.length || (d && !overlaps)) {
      if (d) {
        d.misses += 1;
        if (d.misses >= MISSES_BEFORE_RESET) resetDwell();
      }
      if (!labels.length || (dwell.current && !overlaps)) return;
    }

    if (!dwell.current) {
      dwell.current = { start: now, counts: {}, frames: 0, misses: 0, labelSi: {} };
    }
    const cur = dwell.current;
    cur.frames += 1;
    cur.misses = 0;
    movable.forEach((m) => {
      cur.counts[m.label] = (cur.counts[m.label] || 0) + 1;
      cur.labelSi[m.label] = m.label_si;
    });

    // Only objects that were present in most of the countdown get saved, so a
    // cup that flickered into view for one frame isn't "remembered".
    const steady = Object.keys(cur.counts).filter((l) => cur.counts[l] >= Math.max(1, cur.frames * 0.4));
    setEngaged(steady.map((l) => cur.labelSi[l] || l));
    const elapsed = now - cur.start;
    setProgress(Math.min(1, elapsed / DWELL_MS));

    if (elapsed >= DWELL_MS && steady.length) {
      const key = [...steady].sort().join('|');
      if (lastSaved.current && lastSaved.current.key === key && now - lastSaved.current.at < RESAVE_COOLDOWN_MS) {
        resetDwell(); // just saved these - don't save the same scene every 20 seconds
        return;
      }
      saveMoment(steady);
    }
  }, [checkPerson, saveMoment, endVisit]);

  // The loop below reads the latest handler through a ref, so re-renders never
  // restart it (a restart would briefly run two loops against the server).
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  // ─── Camera loop ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!cam || !patientId) return;
    if (cam.source === 'phone' && !permission?.granted) return;
    let alive = true;

    const tick = async () => {
      const form = new FormData();
      form.append('patient_id', patientId);
      if (cam.source === 'esp32') {
        form.append('esp32_url', `http://${cam.esp32Ip}/capture`);
      } else {
        // skipProcessing is safe because the server applies the EXIF rotation itself.
        const shot = await cameraRef.current?.takePictureAsync({ quality: 0.5, shutterSound: false, skipProcessing: true });
        if (!shot?.uri) return;
        form.append('file', { uri: shot.uri, name: 'frame.jpg', type: 'image/jpeg' } as any);
      }
      const res = await axios.post(`${AI_URL}/detect-live`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }, timeout: 20000,
      });
      if (res.data.status !== 'success') throw new Error(res.data.message);
      if (!alive) return;
      setOffline(false);
      setDetections(res.data.detections);
      if (res.data.width && res.data.height) setAspect(res.data.width / res.data.height);
      if (res.data.frame_b64) setEspFrame(`data:image/jpeg;base64,${res.data.frame_b64}`);
      onFrameRef.current(res.data.detections);
    };

    (async () => {
      await sleep(800); // let the camera warm up
      speak('ඔබේ දේවල් දිහා බලන්න. මම මතක තියාගන්නම්.');
      while (alive && mounted.current) {
        if (busy.current || pausedRef.current) {
          await sleep(300);
          continue;
        }
        try {
          await tick(); // next frame goes as soon as this one is answered
        } catch {
          if (alive) setOffline(true);
          await sleep(2000);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [cam, patientId, permission?.granted]);

  // ─── Render ──────────────────────────────────────────────────────────
  if (!cam) return <View style={s.container} />;
  if (cam.source === 'phone' && !permission?.granted) {
    return (
      <SafeAreaView style={[s.container, s.center]}>
        <Ionicons name="camera" size={64} color="#60a5fa" />
        <Text style={s.permTitle}>කැමරාවට අවසර දෙන්න</Text>
        <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
          <Text style={s.permBtnText}>Allow camera</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const viewH = VIEW_W / aspect;
  const secondsLeft = Math.ceil((1 - progress) * (DWELL_MS / 1000));
  const R = 30;
  const CIRC = 2 * Math.PI * R;

  const personLeft = Math.ceil((1 - personProgress) * (PERSON_DWELL_MS / 1000));
  const statusText: Record<Phase, string> = {
    watching: personProgress > 0 ? `කෙනෙක් එක්ක ඉන්නවා... ${personLeft}`
      : progress > 0 ? `තව තත්පර ${secondsLeft}යි...` : 'ඔබේ දේවල් දිහා බලන්න',
    saving: 'මතක තියාගන්නවා...',
    asking: 'මේ කවුද?',
    listening: `කතා කරන්න... ${listenLeft}`,
    thinking: 'තේරුම් ගන්නවා...',
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>මතක තියාගන්න</Text>
          <Text style={s.sub}>{cam.source === 'esp32' ? `ESP32 · ${cam.esp32Ip}` : 'Phone camera'} · live</Text>
        </View>
        <TouchableOpacity onPress={() => setPaused((p) => !p)} style={s.iconBtn}>
          <Ionicons name={paused ? 'play' : 'pause'} size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={[s.viewport, { height: viewH }]}>
        {cam.source === 'phone' ? (
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" animateShutter={false}
            pictureSize={pictureSize} onCameraReady={onCameraReady} />
        ) : espFrame ? (
          <Image source={{ uri: espFrame }} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, s.center]}>
            <Text style={s.waitText}>ESP32 කැමරාවට සම්බන්ධ වෙනවා...</Text>
          </View>
        )}

        {detections.map((d, i) => {
          const [x1, y1, x2, y2] = d.box;
          const tagged = d.label === 'person' && personTag;
          const c = tagged ? personTag.color : colorFor(d.label);
          return (
            <View key={`${d.label}-${i}`} pointerEvents="none"
              style={[s.box, { left: x1 * VIEW_W, top: y1 * viewH, width: (x2 - x1) * VIEW_W, height: (y2 - y1) * viewH, borderColor: c }]}>
              <View style={[s.tag, { backgroundColor: c }]}>
                <Text style={s.tagText}>{tagged ? personTag.text : `${d.label_si} ${Math.round(d.confidence * 100)}%`}</Text>
              </View>
            </View>
          );
        })}

        {progress > 0 && phase === 'watching' && (
          <View style={s.ring} pointerEvents="none">
            <Svg width={84} height={84}>
              <Circle cx={42} cy={42} r={R} stroke="rgba(255,255,255,0.25)" strokeWidth={8} fill="rgba(15,23,42,0.6)" />
              <Circle cx={42} cy={42} r={R} stroke="#22c55e" strokeWidth={8} fill="none"
                strokeDasharray={`${CIRC}`} strokeDashoffset={CIRC * (1 - progress)}
                strokeLinecap="round" rotation={-90} origin="42,42" />
            </Svg>
            <Text style={s.ringText}>{secondsLeft}</Text>
          </View>
        )}

        {personProgress > 0 && phase === 'watching' && (
          <View style={[s.ring, s.ringLeft]} pointerEvents="none">
            <Svg width={84} height={84}>
              <Circle cx={42} cy={42} r={R} stroke="rgba(255,255,255,0.25)" strokeWidth={8} fill="rgba(15,23,42,0.6)" />
              <Circle cx={42} cy={42} r={R} stroke="#f97316" strokeWidth={8} fill="none"
                strokeDasharray={`${CIRC}`} strokeDashoffset={CIRC * (1 - personProgress)}
                strokeLinecap="round" rotation={-90} origin="42,42" />
            </Svg>
            <Ionicons name="person" size={18} color="#fdba74" style={s.ringIcon} />
            <Text style={s.ringText}>{personLeft}</Text>
          </View>
        )}

        {paused && (
          <View style={[StyleSheet.absoluteFill, s.center, s.pausedVeil]}>
            <Ionicons name="pause-circle" size={72} color="#fff" />
            <Text style={s.pausedText}>නවත්තලා</Text>
          </View>
        )}
      </View>

      {offline && (
        <View style={s.offline}>
          <Ionicons name="cloud-offline" size={18} color="#fecaca" />
          <Text style={s.offlineText}>AI සේවාවට සම්බන්ධ වෙන්න බැහැ ({AI_URL})</Text>
        </View>
      )}

      <View style={s.panel}>
        <View style={s.statusRow}>
          {phase === 'listening' ? <Ionicons name="mic" size={26} color="#f43f5e" />
            : phase === 'saving' ? <Ionicons name="bookmark" size={24} color="#22c55e" />
              : <Ionicons name="eye" size={24} color="#60a5fa" />}
          <Text style={s.status}>{statusText[phase]}</Text>
        </View>

        {engaged.length > 0 && phase === 'watching' && (
          <View style={s.chips}>
            {engaged.map((n) => (
              <View key={n} style={s.chip}><Text style={s.chipText}>{n}</Text></View>
            ))}
          </View>
        )}

        {phase === 'asking' && askRetry && (
          <View style={s.askRow}>
            <TouchableOpacity style={[s.askBtn, { backgroundColor: '#f43f5e' }]} onPress={listenForName}>
              <Ionicons name="mic" size={20} color="#fff" />
              <Text style={s.askText}>ආයෙත් කියන්න</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.askBtn, { backgroundColor: '#334155' }]} onPress={skipPerson}>
              <Text style={s.askText}>පසුව</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === 'watching' && !engaged.length && (
          <Text style={s.help}>කෝප්පය, බෝතලය, කණ්ණාඩිය වගේ දෙයක් එක්ක තත්පර 30ක් ඉන්න - මම මතක තියාගන්නම්. කෙනෙක් එක්ක තත්පර 30ක් හිටියොත් මම "මේ කවුද?" කියලා අහනවා; ඔබට හරි එයාට හරි කියන්න පුළුවන්.</Text>
        )}
      </View>

      {toast && (
        <View style={[s.toast, toast.tone === 'warn' ? s.toastWarn : toast.tone === 'info' ? s.toastInfo : s.toastOk]}>
          {toast.photo ? <Image source={{ uri: toast.photo }} style={s.toastImg} /> : <Ionicons name="checkmark-circle" size={30} color="#fff" />}
          <Text style={s.toastText}>{toast.text}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1120' },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  iconBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 22, fontWeight: '900' },
  sub: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },

  viewport: { marginHorizontal: 12, borderRadius: 24, overflow: 'hidden', backgroundColor: '#000' },
  waitText: { color: '#cbd5e1', fontWeight: '700' },
  box: { position: 'absolute', borderWidth: 3, borderRadius: 8 },
  tag: { position: 'absolute', top: -26, left: -3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tagText: { color: '#fff', fontWeight: '900', fontSize: 13 },

  ring: { position: 'absolute', top: 14, right: 14, width: 84, height: 84, alignItems: 'center', justifyContent: 'center' },
  ringText: { position: 'absolute', color: '#fff', fontSize: 24, fontWeight: '900' },
  ringLeft: { right: undefined, left: 14 },
  ringIcon: { position: 'absolute', top: 18 },
  pausedVeil: { backgroundColor: 'rgba(2,6,23,0.6)' },
  pausedText: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 6 },

  offline: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#7f1d1d', marginHorizontal: 12, marginTop: 10, padding: 10, borderRadius: 14 },
  offlineText: { color: '#fecaca', fontWeight: '700', fontSize: 12, flex: 1 },

  panel: { flex: 1, margin: 12, backgroundColor: '#111827', borderRadius: 24, padding: 16, gap: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  status: { color: '#fff', fontSize: 20, fontWeight: '900', flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#14532d', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { color: '#bbf7d0', fontWeight: '800', fontSize: 15 },
  help: { color: '#94a3b8', fontSize: 14, lineHeight: 21 },
  askRow: { flexDirection: 'row', gap: 10 },
  askBtn: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 16, paddingVertical: 14 },
  askText: { color: '#fff', fontWeight: '900', fontSize: 16 },

  toast: { position: 'absolute', left: 16, right: 16, bottom: 30, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 20 },
  toastOk: { backgroundColor: '#15803d' },
  toastInfo: { backgroundColor: '#1d4ed8' },
  toastWarn: { backgroundColor: '#b45309' },
  toastImg: { width: 52, height: 52, borderRadius: 12, backgroundColor: '#0f172a' },
  toastText: { color: '#fff', fontWeight: '800', fontSize: 16, flex: 1 },

  permTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginVertical: 14 },
  permBtn: { backgroundColor: '#2563eb', borderRadius: 16, paddingHorizontal: 26, paddingVertical: 14 },
  permBtnText: { color: '#fff', fontWeight: '900', fontSize: 16 },
});
