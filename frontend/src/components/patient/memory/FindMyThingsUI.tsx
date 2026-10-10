import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Modal, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import axios from 'axios';
import {
  AI_URL, CameraSource, getPatientId, getPatientName, loadCameraSource, saveCameraSource, speak,
} from '../../../services/memoryAI';
import {
  Esp32Art, MapArt, PeopleArt, PhoneCamArt, RememberArt, StoryArt, VoiceArt,
} from './findThings/Illustrations';

const ROOMS = ['Living room', 'Kitchen', 'Bedroom', 'Dining room', 'Bathroom', 'Hallway'];

type Card = {
  key: string;
  si: string;
  en: string;
  hint: string;
  route: string;
  Art: React.ComponentType<{ size?: number }>;
  bg: string;
  accent: string;
};

const CARDS: Card[] = [
  { key: 'remember', si: 'මතක තියාගන්න', en: 'Remember my things', hint: 'කැමරාව ඔබේ දේවල් දකිනවා',
    route: '/patient/remember-live', Art: RememberArt, bg: '#eff6ff', accent: '#2563eb' },
  { key: 'voice', si: 'හඬින් හොයන්න', en: 'Find by voice', hint: '"මගේ කෝප්පය කොහෙද?"',
    route: '/patient/find-by-voice', Art: VoiceArt, bg: '#f5f3ff', accent: '#7c3aed' },
  { key: 'map', si: 'දේවල් සිතියම', en: 'Object map', hint: 'දැකපු දේවල් තියෙන තැන්',
    route: '/patient/things-map', Art: MapArt, bg: '#f0fdf4', accent: '#16a34a' },
  { key: 'people', si: 'මට හමුවූ අය', en: 'People I met', hint: 'පවුලේ අය සහ යාළුවෝ',
    route: '/patient/people-met', Art: PeopleArt, bg: '#fff7ed', accent: '#ea580c' },
  { key: 'story', si: 'අද මතක කතාව', en: "Today's memory story", hint: 'ඔබේ දවසේ ලස්සන කතාව',
    route: '/patient/memory-story', Art: StoryArt, bg: '#fdf2f8', accent: '#db2777' },
  { key: 'family', si: 'පවුලේ අය ලියාපදිංචිය', en: 'Register family (caregiver)', hint: '🔒 Caregiver PIN එකෙන්',
    route: '/patient/family', Art: PeopleArt, bg: '#f0fdfa', accent: '#0f766e' },
];

export default function FindMyThingsScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [cam, setCam] = useState<CameraSource>({ source: 'phone', esp32Ip: '', room: '' });
  const [counts, setCounts] = useState({ things: 0, people: 0 });
  const [espModal, setEspModal] = useState(false);
  const [ipDraft, setIpDraft] = useState('');
  const [roomDraft, setRoomDraft] = useState('Living room');
  const [testing, setTesting] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [probeInfo, setProbeInfo] = useState('');
  const [passive, setPassive] = useState<{ running: boolean; fps?: number; state?: string; events?: { kind: string; text: string; time: string }[] }>({ running: false });
  const [passiveBusy, setPassiveBusy] = useState(false);

  // While the ESP32 is the chosen camera, show what the server's passive
  // worker is doing (it keeps running even when this screen is closed).
  useFocusEffect(
    useCallback(() => {
      if (cam.source !== 'esp32') return;
      let stop = false;
      const poll = async () => {
        const pid = await getPatientId();
        if (!pid || stop) return;
        try {
          const res = await axios.get(`${AI_URL}/esp32/status/${pid}`, { timeout: 6000 });
          if (!stop) setPassive(res.data.passive || { running: false });
        } catch {}
      };
      poll();
      const t = setInterval(poll, 4000);
      return () => { stop = true; clearInterval(t); };
    }, [cam.source]),
  );

  const togglePassive = async () => {
    const pid = await getPatientId();
    if (!pid || !cam.esp32Ip) return;
    setPassiveBusy(true);
    try {
      const f = new FormData();
      f.append('patient_id', pid);
      if (passive.running) {
        await axios.post(`${AI_URL}/esp32/passive/stop`, f, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 8000 });
        setPassive({ running: false });
        speak('දවස පුරා බලන එක නැවැත්තුවා.');
      } else {
        f.append('ip', cam.esp32Ip);
        f.append('room', cam.room || '');
        const res = await axios.post(`${AI_URL}/esp32/passive/start`, f, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 8000 });
        setPassive(res.data.passive);
        speak('හරි. දැන් ESP32 කැමරාව දවස පුරා තනියම බලාගෙන ඉන්නවා.');
      }
    } catch {}
    setPassiveBusy(false);
  };

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setName(await getPatientName());
        setCam(await loadCameraSource());
        const pid = await getPatientId();
        if (!pid) return;
        try {
          const [t, p] = await Promise.all([
            axios.get(`${AI_URL}/last-seen/${pid}`, { timeout: 8000 }),
            axios.get(`${AI_URL}/people/${pid}`, { timeout: 8000 }),
          ]);
          setCounts({ things: t.data.items?.length || 0, people: p.data.people?.length || 0 });
        } catch {
          // Counts are decoration only; the menu still works offline.
        }
      })();
    }, []),
  );

  const choosePhone = async () => {
    const next = { ...cam, source: 'phone' as const };
    setCam(next);
    await saveCameraSource(next);
    speak('ෆෝන් කැමරාව තෝරා ගත්තා.');
  };

  const openEsp = () => {
    setIpDraft(cam.esp32Ip);
    setRoomDraft(cam.room || 'Living room');
    setTesting('idle');
    setEspModal(true);
  };

  const testAndSaveEsp = async () => {
    const ip = ipDraft.trim();
    if (!ip) return;
    setTesting('testing');
    setProbeInfo('');
    try {
      // The AI server (not the phone) talks to the camera, so test from there:
      // single photo + how fast the live video arrives.
      const res = await axios.get(`${AI_URL}/esp32/probe`, { params: { ip }, timeout: 20000 });
      const d = res.data;
      if (!d.capture_ok && !d.stream_ok) throw new Error(d.capture_error || d.stream_error || 'unreachable');
      setProbeInfo(d.stream_ok ? `Live video ✓ ${d.stream_fps} fps · photo ${d.frame_kb ?? '?'} KB` : 'Photo ✓ (live video not ready yet)');
      const next: CameraSource = { source: 'esp32', esp32Ip: ip, room: roomDraft };
      setCam(next);
      await saveCameraSource(next);
      setTesting('ok');
      speak('ESP32 කැමරාව සම්බන්ධ වුණා.');
      setTimeout(() => setEspModal(false), 900);
    } catch {
      setTesting('fail');
    }
  };

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#0f172a" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>මගේ දේවල්</Text>
            <Text style={s.subtitle}>Find My Things{name ? ` · ${name}` : ''}</Text>
          </View>
        </View>

        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statNum}>{counts.things}</Text>
            <Text style={s.statLbl}>මතක දේවල්</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statNum}>{counts.people}</Text>
            <Text style={s.statLbl}>හඳුනන අය</Text>
          </View>
        </View>

        <Text style={s.section}>කැමරාව · Camera</Text>
        <View style={s.camRow}>
          <TouchableOpacity style={[s.camOpt, cam.source === 'phone' && s.camOptOn]} onPress={choosePhone}>
            <PhoneCamArt size={38} />
            <Text style={[s.camText, cam.source === 'phone' && s.camTextOn]}>ෆෝන් එක</Text>
            <Text style={s.camSub}>Phone camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.camOpt, cam.source === 'esp32' && s.camOptOn]} onPress={openEsp}>
            <Esp32Art size={38} />
            <Text style={[s.camText, cam.source === 'esp32' && s.camTextOn]}>ESP32 කැමරාව</Text>
            <Text style={s.camSub}>{cam.source === 'esp32' && cam.esp32Ip ? cam.esp32Ip : 'Tap to connect'}</Text>
          </TouchableOpacity>
        </View>

        {cam.source === 'esp32' && !!cam.esp32Ip && (
          <View style={s.passiveCard}>
            <View style={s.passiveHead}>
              <Ionicons name="radio" size={22} color={passive.running ? '#16a34a' : '#64748b'} />
              <View style={{ flex: 1 }}>
                <Text style={s.passiveTitle}>දවස පුරා තනියම බලන්න</Text>
                <Text style={s.passiveSub}>
                  {passive.running
                    ? `${passive.state || 'running'}${passive.fps ? ` · ${passive.fps} fps` : ''}`
                    : 'Passive mode - phone can be closed'}
                </Text>
              </View>
              <Switch value={!!passive.running} onValueChange={togglePassive} disabled={passiveBusy} />
            </View>
            {passive.running && (passive.events || []).slice(0, 3).map((e, i) => (
              <Text key={`${e.time}-${i}`} style={s.passiveEvent} numberOfLines={2}>• {e.text}</Text>
            ))}
          </View>
        )}

        <Text style={s.section}>මොකක්ද කරන්න ඕනේ?</Text>
        {CARDS.map(({ key, si, en, hint, route, Art, bg, accent }) => (
          <TouchableOpacity key={key} style={[s.card, { backgroundColor: bg }]} activeOpacity={0.85}
            onPress={() => router.push(route as any)}>
            <Art size={84} />
            <View style={s.cardBody}>
              <Text style={[s.cardSi, { color: accent }]}>{si}</Text>
              <Text style={s.cardEn}>{en}</Text>
              <Text style={s.cardHint}>{hint}</Text>
            </View>
            <View style={[s.go, { backgroundColor: accent }]}>
              <Ionicons name="chevron-forward" size={22} color="#fff" />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={espModal} transparent animationType="slide" onRequestClose={() => setEspModal(false)}>
        <View style={s.modalBg}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Esp32Art size={44} />
              <View style={{ flex: 1 }}>
                <Text style={s.sheetTitle}>ESP32-CAM සම්බන්ධ කරන්න</Text>
                <Text style={s.sheetSub}>Same Wi-Fi as the AI server</Text>
              </View>
              <TouchableOpacity onPress={() => setEspModal(false)}>
                <Ionicons name="close" size={26} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text style={s.label}>Camera IP address</Text>
            <TextInput style={s.input} value={ipDraft} onChangeText={setIpDraft}
              placeholder="e.g. 172.20.10.6" placeholderTextColor="#94a3b8"
              keyboardType="numbers-and-punctuation" autoCapitalize="none" />

            <Text style={s.label}>Room it is mounted in</Text>
            <View style={s.roomWrap}>
              {ROOMS.map((r) => (
                <TouchableOpacity key={r} style={[s.room, roomDraft === r && s.roomOn]} onPress={() => setRoomDraft(r)}>
                  <Text style={[s.roomText, roomDraft === r && { color: '#fff' }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {testing === 'fail' && (
              <Text style={s.err}>Couldn't reach http://{ipDraft}/capture from the AI server. Check the IP, that the camera is powered, and that the hotspot has "Maximize Compatibility" on.</Text>
            )}
            {!!probeInfo && <Text style={s.ok}>{probeInfo}</Text>}

            <TouchableOpacity style={s.connectBtn} onPress={testAndSaveEsp} disabled={testing === 'testing'}>
              {testing === 'testing' ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name={testing === 'ok' ? 'checkmark-circle' : 'wifi'} size={20} color="#fff" />
                  <Text style={s.connectText}>{testing === 'ok' ? 'සම්බන්ධයි!' : 'Test & connect'}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { padding: 20, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  backBtn: { width: 46, height: 46, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  title: { fontSize: 28, fontWeight: '900', color: '#0f172a' },
  subtitle: { fontSize: 14, color: '#64748b', fontWeight: '600' },

  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 22 },
  stat: { flex: 1, backgroundColor: '#0f172a', borderRadius: 20, paddingVertical: 14, alignItems: 'center' },
  statNum: { color: '#fff', fontSize: 26, fontWeight: '900' },
  statLbl: { color: '#94a3b8', fontSize: 13, fontWeight: '700' },

  section: { fontSize: 16, fontWeight: '900', color: '#334155', marginBottom: 12 },
  camRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  camOpt: { flex: 1, backgroundColor: '#fff', borderRadius: 20, padding: 14, alignItems: 'center', borderWidth: 2, borderColor: '#e2e8f0', gap: 4 },
  camOptOn: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  camText: { fontSize: 15, fontWeight: '800', color: '#334155' },
  camTextOn: { color: '#1d4ed8' },
  camSub: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },

  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 26, padding: 14, marginBottom: 14, gap: 12 },
  cardBody: { flex: 1 },
  cardSi: { fontSize: 21, fontWeight: '900' },
  cardEn: { fontSize: 13, fontWeight: '700', color: '#475569', marginTop: 2 },
  cardHint: { fontSize: 13, color: '#64748b', marginTop: 6 },
  go: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  modalBg: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 36 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: '#0f172a' },
  sheetSub: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '800', color: '#475569', marginBottom: 8, marginTop: 6 },
  input: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, padding: 14, fontSize: 17, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  roomWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  room: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 1.5, borderColor: '#e2e8f0' },
  roomOn: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  roomText: { fontWeight: '700', color: '#475569' },
  err: { color: '#dc2626', fontWeight: '600', marginBottom: 10 },
  ok: { color: '#15803d', fontWeight: '800', marginBottom: 10 },
  passiveCard: { backgroundColor: '#fff', borderRadius: 20, padding: 14, marginTop: -12, marginBottom: 22, borderWidth: 2, borderColor: '#99f6e4', gap: 6 },
  passiveHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  passiveTitle: { fontSize: 16, fontWeight: '900', color: '#0f172a' },
  passiveSub: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  passiveEvent: { fontSize: 13, color: '#334155' },
  connectBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f766e', borderRadius: 18, paddingVertical: 16, marginTop: 6 },
  connectText: { color: '#fff', fontWeight: '900', fontSize: 16 },
});
