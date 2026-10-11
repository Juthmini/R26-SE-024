import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import axios from 'axios';
import {
  AI_URL, CameraSource, getPatientId, getPatientName, loadCameraSource, saveCameraSource, speak,
} from '../../../services/memoryAI';
import {
  Esp32Art, MapArt, PeopleArt, PhoneCamArt, QuizArt, RememberArt, StoryArt, VoiceArt,
} from './findThings/Illustrations';
import Esp32ConnectSheet, { roomSi } from './findThings/Esp32ConnectSheet';

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
  { key: 'roomcam', si: 'කාමර කැමරාව', en: 'Phone as room camera', hint: '📱 ෆෝන් එක stand එකක තියන්න - තනියම බලනවා',
    route: '/patient/remember-live?room=1', Art: PhoneCamArt, bg: '#f1f5f9', accent: '#334155' },
  { key: 'voice', si: 'හඬින් හොයන්න', en: 'Find by voice', hint: '"මගේ කෝප්පය කොහෙද?"',
    route: '/patient/find-by-voice', Art: VoiceArt, bg: '#f5f3ff', accent: '#7c3aed' },
  { key: 'map', si: 'දේවල් සිතියම', en: 'Object map', hint: 'දැකපු දේවල් තියෙන තැන්',
    route: '/patient/things-map', Art: MapArt, bg: '#f0fdf4', accent: '#16a34a' },
  { key: 'people', si: 'මට හමුවූ අය', en: 'People I met', hint: 'පවුලේ අය සහ යාළුවෝ',
    route: '/patient/people-met', Art: PeopleArt, bg: '#fff7ed', accent: '#ea580c' },
  { key: 'story', si: 'අද මතක කතාව', en: "Today's memory story", hint: 'ඔබේ දවසේ ලස්සන කතාව',
    route: '/patient/memory-story', Art: StoryArt, bg: '#fdf2f8', accent: '#db2777' },
  { key: 'quiz', si: 'මතක සෙල්ලම', en: 'Memory game', hint: '🦉 අද දවස ගැන පොඩි කතාබහක්',
    route: '/patient/memory-quiz', Art: QuizArt, bg: '#FBF5EA', accent: '#2A6F6A' },
  { key: 'family', si: 'පවුලේ අය ලියාපදිංචිය', en: 'Register family (caregiver)', hint: '🔒 Caregiver PIN එකෙන්',
    route: '/patient/family', Art: PeopleArt, bg: '#f0fdfa', accent: '#0f766e' },
];

export default function FindMyThingsScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [cam, setCam] = useState<CameraSource>({ source: 'phone', esp32Ip: '', room: '' });
  const [counts, setCounts] = useState({ things: 0, people: 0 });
  const [espModal, setEspModal] = useState(false);
  const [espOnline, setEspOnline] = useState<boolean | null>(null);
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
        const saved = await loadCameraSource();
        setCam(saved);
        if (saved.source === 'esp32') reconnectEsp(saved);
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

  // The hotspot gives the camera a new IP after reconnecting - quietly find it
  // again every time this screen opens, so the saved address is never stale.
  const reconnectEsp = async (saved: CameraSource) => {
    setEspOnline(null);
    try {
      const res = await axios.get(`${AI_URL}/esp32/discover`, { timeout: 25000 });
      const cams: { ip: string }[] = res.data.cameras || [];
      if (!cams.length) return setEspOnline(false);
      const ip = cams.find((c) => c.ip === saved.esp32Ip)?.ip || cams[0].ip;
      if (ip !== saved.esp32Ip) {
        const next = { ...saved, esp32Ip: ip };
        setCam(next);
        await saveCameraSource(next);
      }
      setEspOnline(true);
    } catch {
      setEspOnline(false);
    }
  };

  const onEspConnected = async (cfg: CameraSource) => {
    setCam(cfg);
    setEspOnline(true);
    await saveCameraSource(cfg);
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
          <TouchableOpacity style={[s.camOpt, cam.source === 'esp32' && s.camOptOn]} onPress={() => setEspModal(true)}>
            <Esp32Art size={38} />
            <Text style={[s.camText, cam.source === 'esp32' && s.camTextOn]}>ESP32 කැමරාව</Text>
            {cam.source === 'esp32' ? (
              <View style={s.espStatus}>
                <View style={[s.statusDot, { backgroundColor: espOnline === false ? '#ef4444' : espOnline ? '#22c55e' : '#f59e0b' }]} />
                <Text style={s.camSub}>
                  {espOnline === false ? 'සම්බන්ධ නැහැ' : espOnline ? roomSi(cam.room) || 'සම්බන්ධයි' : 'හොයනවා...'}
                </Text>
              </View>
            ) : (
              <Text style={s.camSub}>ඔබන්න - ඉබේම හොයනවා</Text>
            )}
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

      <Esp32ConnectSheet
        visible={espModal}
        current={cam}
        onClose={() => setEspModal(false)}
        onConnected={onEspConnected}
      />
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

  espStatus: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  passiveCard: { backgroundColor: '#fff', borderRadius: 20, padding: 14, marginTop: -12, marginBottom: 22, borderWidth: 2, borderColor: '#99f6e4', gap: 6 },
  passiveHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  passiveTitle: { fontSize: 16, fontWeight: '900', color: '#0f172a' },
  passiveSub: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  passiveEvent: { fontSize: 13, color: '#334155' },
});
