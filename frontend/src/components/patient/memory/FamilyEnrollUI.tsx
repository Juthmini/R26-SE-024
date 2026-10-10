import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import axios from 'axios';
import {
  AI_URL, RELATIONS, getCaregiverPin, getPatientId, speak, stopSpeaking,
} from '../../../services/memoryAI';

// Several angles make the face gallery robust from day one (see adaptive learning).
const POSES = [
  { si: 'කෙළින් කැමරාව දිහා බලන්න', en: 'Look straight at the camera' },
  { si: 'ටිකක් වම් පැත්තට හරවන්න', en: 'Turn slightly left' },
  { si: 'ටිකක් දකුණු පැත්තට හරවන්න', en: 'Turn slightly right' },
  { si: 'දැන් හිනාවෙන්න', en: 'Now smile' },
];
const COUNTDOWN = 3;

type Shot = { uri: string; ok: boolean | null; problem?: string };
type Step = 'capture' | 'details' | 'saving' | 'done';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function FamilyEnrollUI() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [step, setStep] = useState<Step>('capture');
  const [shots, setShots] = useState<Shot[]>([]);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [relation, setRelation] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState<{ name: string; relation_si: string; photo_url: string; samples: number } | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (!getCaregiverPin()) router.replace('/patient/family' as any); // session expired -> back to the PIN gate
    return () => { alive.current = false; stopSpeaking(); };
  }, [router]);

  const poseIndex = Math.min(shots.filter((s) => s.ok).length, POSES.length - 1);
  const goodShots = shots.filter((s) => s.ok);

  const checkShot = async (uri: string): Promise<Shot> => {
    try {
      const f = new FormData();
      f.append('file', { uri, name: 'face.jpg', type: 'image/jpeg' } as any);
      const res = await axios.post(`${AI_URL}/family/check-photo`, f, {
        headers: { 'Content-Type': 'multipart/form-data' }, timeout: 20000,
      });
      return { uri, ok: !!res.data.ok, problem: res.data.problem || res.data.message };
    } catch {
      return { uri, ok: false, problem: 'AI සේවාවට සම්බන්ධ වෙන්න බැහැ' };
    }
  };

  const takePose = async () => {
    if (busy || !cameraRef.current) return;
    setBusy(true);
    setMessage('');
    const pose = POSES[poseIndex];
    await speak(pose.si);
    for (let i = COUNTDOWN; i > 0; i--) {
      if (!alive.current) return;
      setCount(i);
      await sleep(800);
    }
    setCount(0);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, shutterSound: false });
      if (!photo?.uri) throw new Error('no photo');
      const shot = await checkShot(photo.uri);
      setShots((prev) => [...prev, shot]);
      if (shot.ok) {
        const okNow = goodShots.length + 1;
        if (okNow >= POSES.length) {
          await speak('හොඳයි! photos ඔක්කොම හරි.');
          setStep('details');
        } else {
          speak('හරි.');
        }
      } else {
        setMessage(shot.problem || 'ආයෙත් ගන්න');
        speak(`${shot.problem || 'හරි ගියේ නැහැ'}. ආයෙත් ගමු.`);
      }
    } catch {
      setMessage('Photo එක ගන්න බැරි වුණා');
    }
    setBusy(false);
  };

  const save = async () => {
    const pid = await getPatientId();
    const pin = getCaregiverPin();
    if (!pid || !pin) return router.replace('/patient/family' as any);
    if (!relation) return setMessage('Relation එක තෝරන්න');
    setStep('saving');
    setMessage('');
    try {
      const f = new FormData();
      f.append('patient_id', pid);
      f.append('pin', pin);
      f.append('name', name.trim());
      f.append('relation', relation);
      goodShots.forEach((s, i) => f.append('files', { uri: s.uri, name: `face${i}.jpg`, type: 'image/jpeg' } as any));
      const res = await axios.post(`${AI_URL}/family/enroll`, f, {
        headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000,
      });
      if (res.data.status === 'success') {
        const p = res.data.person;
        setSaved({ name: p.name, relation_si: p.relation_si, photo_url: p.photo_url, samples: res.data.photos_used });
        setStep('done');
        speak(`${p.name !== p.relation_si ? p.name + ', ' : ''}${p.relation_si} ලියාපදිංචි වුණා.`);
      } else {
        setMessage(res.data.message + (res.data.problems?.length ? `\n${res.data.problems.join('\n')}` : ''));
        setStep(res.data.status === 'duplicate' ? 'details' : 'capture');
        if (res.data.status !== 'duplicate') setShots([]);
      }
    } catch {
      setMessage('සුරකින්න බැරි වුණා. AI සේවාව බලන්න.');
      setStep('details');
    }
  };

  const header = (
    <View style={s.header}>
      <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={s.title}>අලුත් කෙනෙක්</Text>
        <Text style={s.sub}>Register a family member</Text>
      </View>
    </View>
  );

  if (!permission?.granted) {
    return (
      <SafeAreaView style={s.container}>
        {header}
        <View style={s.center}>
          <Ionicons name="camera" size={56} color="#5eead4" />
          <TouchableOpacity style={s.primary} onPress={requestPermission}>
            <Text style={s.primaryText}>Allow camera</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'done' && saved) {
    return (
      <SafeAreaView style={s.container}>
        {header}
        <View style={s.doneCard}>
          <Image source={{ uri: saved.photo_url }} style={s.doneImg} />
          <Ionicons name="checkmark-circle" size={48} color="#22c55e" />
          <Text style={s.doneTitle}>{saved.relation_si}{saved.name !== saved.relation_si ? ` · ${saved.name}` : ''}</Text>
          <Text style={s.doneSub}>ලියාපදිංචි වුණා · මුහුණු {saved.samples}ක් ඉගෙනගත්තා</Text>
          <Text style={s.doneHelp}>දැන් මේ කෙනා camera එකට ආවම, අහන්නේ නැතුවම "මේ ඔබේ {saved.relation_si}" කියනවා. කවුරු හරි බොරුවට "{saved.relation_si}" කිව්වොත්, මුහුණ ගැලපෙන්නේ නැත්නම් ඔබට අනතුරු ඇඟවීමක් එනවා.</Text>
          <TouchableOpacity style={s.primary} onPress={() => router.back()}>
            <Text style={s.primaryText}>හරි</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'details' || step === 'saving') {
    return (
      <SafeAreaView style={s.container}>
        {header}
        <ScrollView contentContainerStyle={s.scroll}>
          <View style={s.thumbs}>
            {goodShots.map((sh) => <Image key={sh.uri} source={{ uri: sh.uri }} style={s.thumb} />)}
          </View>
          <Text style={s.label}>නම (Name)</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder="e.g. කමල්" placeholderTextColor="#64748b" />
          <Text style={s.label}>රෝගියාට මොකද්ද? (Relation)</Text>
          <View style={s.relGrid}>
            {RELATIONS.map((r) => (
              <TouchableOpacity key={r.en} style={[s.rel, relation === r.en && s.relOn]} onPress={() => setRelation(r.en)}>
                <Text style={s.relEmoji}>{r.emoji}</Text>
                <Text style={[s.relText, relation === r.en && { color: '#fff' }]}>{r.si}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {!!message && <Text style={s.err}>{message}</Text>}
          <TouchableOpacity style={s.primary} onPress={save} disabled={step === 'saving'}>
            {step === 'saving' ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>ලියාපදිංචි කරන්න</Text>}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      {header}
      <View style={s.camBox}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} animateShutter={false} />
        <View style={s.oval} pointerEvents="none" />
        {count > 0 && <Text style={s.count}>{count}</Text>}
        <TouchableOpacity style={s.flip} onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}>
          <Ionicons name="camera-reverse" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={s.panel}>
        <View style={s.progressRow}>
          {POSES.map((p, i) => (
            <View key={p.en} style={[s.dot, i < goodShots.length && s.dotDone, i === poseIndex && goodShots.length < POSES.length && s.dotNow]} />
          ))}
        </View>
        <Text style={s.poseSi}>{POSES[poseIndex].si}</Text>
        <Text style={s.poseEn}>{POSES[poseIndex].en} · {goodShots.length}/{POSES.length}</Text>
        {!!message && <Text style={s.err}>{message}</Text>}
        <TouchableOpacity style={[s.shutter, busy && { opacity: 0.6 }]} onPress={takePose} disabled={busy}>
          {busy ? <ActivityIndicator color="#0f766e" /> : <Ionicons name="camera" size={34} color="#0f766e" />}
        </TouchableOpacity>
        <View style={s.thumbs}>
          {shots.map((sh, i) => (
            <View key={`${sh.uri}-${i}`}>
              <Image source={{ uri: sh.uri }} style={[s.thumb, !sh.ok && s.thumbBad]} />
              <Ionicons name={sh.ok ? 'checkmark-circle' : 'close-circle'} size={18} color={sh.ok ? '#22c55e' : '#ef4444'} style={s.thumbIcon} />
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#042f2e' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  scroll: { padding: 20, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  backBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#134e4a', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 22, fontWeight: '900' },
  sub: { color: '#5eead4', fontSize: 12, fontWeight: '700' },

  camBox: { marginHorizontal: 14, height: 380, borderRadius: 28, overflow: 'hidden', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  oval: { width: 210, height: 280, borderRadius: 140, borderWidth: 4, borderColor: '#5eead4', borderStyle: 'dashed' },
  count: { position: 'absolute', color: '#fff', fontSize: 96, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 12 },
  flip: { position: 'absolute', top: 14, right: 14, backgroundColor: 'rgba(15,23,42,0.6)', borderRadius: 14, padding: 10 },

  panel: { flex: 1, margin: 14, backgroundColor: '#0f3d3a', borderRadius: 26, padding: 16, alignItems: 'center', gap: 8 },
  progressRow: { flexDirection: 'row', gap: 8 },
  dot: { width: 34, height: 8, borderRadius: 4, backgroundColor: '#134e4a' },
  dotDone: { backgroundColor: '#22c55e' },
  dotNow: { backgroundColor: '#5eead4' },
  poseSi: { color: '#fff', fontSize: 22, fontWeight: '900', textAlign: 'center' },
  poseEn: { color: '#99f6e4', fontSize: 13, fontWeight: '700' },
  shutter: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 5, borderColor: '#5eead4', marginVertical: 6 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 12 },
  thumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#134e4a' },
  thumbBad: { opacity: 0.4 },
  thumbIcon: { position: 'absolute', right: -4, top: -4 },

  label: { color: '#99f6e4', fontWeight: '800', marginBottom: 8, marginTop: 6 },
  input: { backgroundColor: '#0f3d3a', borderRadius: 16, padding: 14, color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 12, borderWidth: 1, borderColor: '#134e4a' },
  relGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  rel: { width: '31%', backgroundColor: '#0f3d3a', borderRadius: 16, paddingVertical: 10, alignItems: 'center', borderWidth: 2, borderColor: '#134e4a' },
  relOn: { backgroundColor: '#0f766e', borderColor: '#5eead4' },
  relEmoji: { fontSize: 24 },
  relText: { color: '#ccfbf1', fontWeight: '800', marginTop: 2 },
  err: { color: '#fca5a5', fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  primary: { alignSelf: 'stretch', backgroundColor: '#14b8a6', borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  primaryText: { color: '#042f2e', fontWeight: '900', fontSize: 17 },

  doneCard: { margin: 20, backgroundColor: '#0f3d3a', borderRadius: 28, padding: 24, alignItems: 'center', gap: 10 },
  doneImg: { width: 140, height: 140, borderRadius: 70, borderWidth: 4, borderColor: '#5eead4' },
  doneTitle: { color: '#fff', fontSize: 24, fontWeight: '900' },
  doneSub: { color: '#5eead4', fontWeight: '800' },
  doneHelp: { color: '#ccfbf1', textAlign: 'center', lineHeight: 21, marginBottom: 6 },
});
