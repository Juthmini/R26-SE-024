import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import axios from 'axios';
import {
  AI_URL, CameraSource, getPatientId, getPatientName, loadCameraSource, saveCameraSource, speak,
} from '../../../services/memoryAI';
import {
  Esp32Art, FamilyArt, MapArt, PeopleArt, PhoneCamArt, QuizArt, ReminderArt, RememberArt, RoomCamArt, StoryArt, TalkArt, VoiceArt,
} from './findThings/Illustrations';
import HeroScene, { dayPart } from './findThings/HeroScene';
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
  { key: 'remember', si: 'මතක තියාගන්න', en: 'Remember things', hint: 'කැමරාව ඔබේ දේවල් දකිනවා',
    route: '/patient/remember-live', Art: RememberArt, bg: '#eff6ff', accent: '#2563eb' },
  { key: 'roomcam', si: 'කාමර කැමරාව', en: 'Room camera', hint: '📱 ෆෝන් එක stand එකක තියන්න - තනියම බලනවා',
    route: '/patient/remember-live?room=1', Art: RoomCamArt, bg: '#f1f5f9', accent: '#334155' },
  { key: 'voice', si: 'හඬින් හොයන්න', en: 'Find by voice', hint: '"මගේ කෝප්පය කොහෙද?"',
    route: '/patient/find-by-voice', Art: VoiceArt, bg: '#f5f3ff', accent: '#7c3aed' },
  { key: 'map', si: 'දේවල් සිතියම', en: 'Object map', hint: 'දැකපු දේවල් තියෙන තැන්',
    route: '/patient/things-map', Art: MapArt, bg: '#f0fdf4', accent: '#16a34a' },
  { key: 'people', si: 'මට හමුවූ අය', en: 'People I met', hint: 'පවුලේ අය සහ යාළුවෝ',
    route: '/patient/people-met', Art: PeopleArt, bg: '#fff7ed', accent: '#ea580c' },
  { key: 'remind', si: 'මතක් කිරීම්', en: 'Reminders', hint: 'බෙහෙත්, තේ, එන අය',
    route: '/patient/reminders', Art: ReminderArt, bg: '#FFFBEB', accent: '#B45309' },
  { key: 'talk', si: 'කතාබහ', en: 'Visit conversations', hint: 'පවුලේ අය කතා කරපු දේ',
    route: '/patient/conversations', Art: TalkArt, bg: '#ECFDF8', accent: '#0F9D8A' },
  { key: 'story', si: 'අද මතක කතාව', en: 'Memory story', hint: 'ඔබේ දවසේ ලස්සන කතාව',
    route: '/patient/memory-story', Art: StoryArt, bg: '#fdf2f8', accent: '#db2777' },
  { key: 'quiz', si: 'මතක සෙල්ලම', en: 'Memory game', hint: '🦉 අද දවස ගැන පොඩි කතාබහක්',
    route: '/patient/memory-quiz', Art: QuizArt, bg: '#FBF5EA', accent: '#2A6F6A' },
  { key: 'family', si: 'පවුලේ අය', en: 'Family · caregiver 🔒', hint: '🔒 Caregiver PIN එකෙන්',
    route: '/patient/family', Art: FamilyArt, bg: '#f0fdfa', accent: '#0f766e' },
];

export default function FindMyThingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [name, setName] = useState('');
  const [cam, setCam] = useState<CameraSource>({ source: 'phone', esp32Ip: '', room: '' });
  const [counts, setCounts] = useState({ things: 0, people: 0 });
  const [espModal, setEspModal] = useState(false);
  const [espOnline, setEspOnline] = useState<boolean | null>(null);
  const [passive, setPassive] = useState<{ running: boolean; fps?: number; state?: string; events?: { kind: string; text: string; time: string }[] }>({ running: false });
  const [passiveBusy, setPassiveBusy] = useState(false);
  const [quiz, setQuiz] = useState<{ ready: boolean; count: number; played: boolean } | null>(null);
  const [due, setDue] = useState<{ id: string; say_si: string }[]>([]);

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
          axios.get(`${AI_URL}/quiz/today/${pid}`, { timeout: 8000 }).then((q) => setQuiz(q.data)).catch(() => {});
          axios.get(`${AI_URL}/reminders/due/${pid}`, { timeout: 8000 }).then((r) => {
            const list = r.data.due || [];
            setDue(list);
            if (list.length) speak(list[0].say_si);
          }).catch(() => {});
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

  const part = dayPart();
  const greeting = { morning: 'සුභ උදෑසනක්', day: 'සුභ දහවලක්', evening: 'සුභ සන්ධ්‍යාවක්', night: 'සුභ රාත්‍රියක්' }[part];
  const heroH = 300 + insets.top;
  const camLabel = cam.source === 'esp32' ? `ESP32${cam.room ? ` · ${roomSi(cam.room)}` : ''}` : 'ෆෝන් කැමරාව';

  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Hero ─────────────────────────────────────────────── */}
        <View style={{ height: heroH }}>
          <HeroScene width={width} height={heroH} part={part} bg={BG} />
          <View style={[s.heroContent, { paddingTop: insets.top + 10 }]}>
            <View style={s.heroTop}>
              <TouchableOpacity onPress={() => router.back()} style={s.glassBtn} hitSlop={8}>
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/patient/memory-quiz' as any)} style={s.glassBtn} hitSlop={8}>
                <Text style={{ fontSize: 20 }}>🦉</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.hello}>{greeting},</Text>
            <Text style={s.helloName} numberOfLines={2}>{name || 'ආදරණීය ඔබට'}</Text>
            <View style={s.chipRow}>
              <View style={s.glassChip}>
                <Ionicons name="sparkles" size={15} color="#fff" />
                <Text style={s.glassChipText}>Memory Vault · {camLabel}</Text>
              </View>
            </View>
            <View style={s.chipRow}>
              <View style={s.glassChipSm}>
                <Text style={s.glassChipNum}>{counts.things}</Text>
                <Text style={s.glassChipText}>මතක දේවල්</Text>
              </View>
              <View style={s.glassChipSm}>
                <Text style={s.glassChipNum}>{counts.people}</Text>
                <Text style={s.glassChipText}>හඳුනන අය</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={s.body}>
          {due.map((d) => (
            <TouchableOpacity key={d.id} style={s.dueCard} onPress={() => speak(d.say_si)} activeOpacity={0.85}>
              <Text style={{ fontSize: 26 }}>⏰</Text>
              <Text style={s.dueText}>{d.say_si}</Text>
              <TouchableOpacity onPress={() => setDue((x) => x.filter((y) => y.id !== d.id))} hitSlop={10}>
                <Ionicons name="close" size={20} color="#92400E" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}

          {/* ── Camera ───────────────────────────────────────── */}
          <Text style={s.section}>කැමරාව</Text>
          <View style={s.camRow}>
            <TouchableOpacity style={[s.camOpt, cam.source === 'phone' && s.camOptOn]} onPress={choosePhone} activeOpacity={0.85}>
              <View style={s.camTile}><PhoneCamArt size={40} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.camText}>ෆෝන් එක</Text>
                <Text style={s.camSub}>Phone camera</Text>
              </View>
              {cam.source === 'phone' && <Ionicons name="checkmark-circle" size={20} color={ACCENT} style={s.camCheck} />}
            </TouchableOpacity>
            <TouchableOpacity style={[s.camOpt, cam.source === 'esp32' && s.camOptOn]} onPress={() => setEspModal(true)} activeOpacity={0.85}>
              <View style={s.camTile}><Esp32Art size={40} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.camText}>ESP32</Text>
                {cam.source === 'esp32' ? (
                  <View style={s.espStatus}>
                    <View style={[s.statusDot, { backgroundColor: espOnline === false ? '#ef4444' : espOnline ? '#22c55e' : '#f59e0b' }]} />
                    <Text style={s.camSub} numberOfLines={1}>
                      {espOnline === false ? 'සම්බන්ධ නැහැ' : espOnline ? roomSi(cam.room) || 'සම්බන්ධයි' : 'හොයනවා...'}
                    </Text>
                  </View>
                ) : (
                  <Text style={s.camSub}>ඔබන්න - ඉබේම හොයනවා</Text>
                )}
              </View>
            </TouchableOpacity>
          </View>

          {cam.source === 'esp32' && !!cam.esp32Ip && (
            <View style={s.passiveCard}>
              <View style={s.passiveHead}>
                <Ionicons name="radio" size={22} color={passive.running ? '#16a34a' : '#94a3b8'} />
                <View style={{ flex: 1 }}>
                  <Text style={s.passiveTitle}>දවස පුරා තනියම බලන්න</Text>
                  <Text style={s.passiveSub}>
                    {passive.running
                      ? `${passive.state || 'running'}${passive.fps ? ` · ${passive.fps} fps` : ''}`
                      : 'Passive mode - phone can be closed'}
                  </Text>
                </View>
                <Switch value={!!passive.running} onValueChange={togglePassive} disabled={passiveBusy}
                  trackColor={{ true: ACCENT, false: '#CBD5E1' }} />
              </View>
              {passive.running && (passive.events || []).slice(0, 3).map((e, i) => (
                <Text key={`${e.time}-${i}`} style={s.passiveEvent} numberOfLines={2}>• {e.text}</Text>
              ))}
            </View>
          )}

          {/* ── Menu ─────────────────────────────────────────── */}
          <Text style={s.section}>මගේ මතක උදව්</Text>
          <View style={s.grid}>
            {CARDS.map(({ key, si, en, route, Art, bg }) => (
              <TouchableOpacity key={key} style={s.card} activeOpacity={0.85} onPress={() => router.push(route as any)}>
                <View style={[s.tile, { backgroundColor: bg }]}>
                  <Art size={96} />
                </View>
                <Text style={s.cardSi} numberOfLines={2}>{si}</Text>
                <Text style={s.cardEn} numberOfLines={1}>{en}</Text>
                {key === 'quiz' && quiz && (quiz.played || quiz.ready) && (
                  <View style={[s.badge, quiz.played && { backgroundColor: '#DCFCE7' }]}>
                    <Text style={[s.badgeText, quiz.played && { color: '#15803D' }]}>
                      {quiz.played ? '✓ අද කළා' : `ප්‍රශ්න ${quiz.count}ක් සූදානම්`}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      <Esp32ConnectSheet
        visible={espModal}
        current={cam}
        onClose={() => setEspModal(false)}
        onConnected={onEspConnected}
      />
    </View>
  );
}

const BG = '#F4F7F5';      // soft white page
const CARD = '#FFFFFF';
const INK = '#0F2A24';
const MUTED = '#64748B';
const LINE = '#E3EAE7';
const ACCENT = '#0F9D8A';

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { paddingBottom: 48 },

  heroContent: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 22 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  glassBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center',
    justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  hello: { color: '#fff', fontSize: 28, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6 },
  helloName: { color: '#fff', fontSize: 30, fontWeight: '900', marginTop: 2, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6 },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  glassChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  glassChipSm: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(15,23,42,0.35)',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  glassChipText: { color: '#fff', fontSize: 13.5, fontWeight: '700' },
  glassChipNum: { color: '#fff', fontSize: 15, fontWeight: '900' },

  body: { paddingHorizontal: 20, marginTop: 6 },
  section: { fontSize: 21, fontWeight: '900', color: INK, marginBottom: 14, marginTop: 10 },

  camRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  camOpt: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: CARD, borderRadius: 22,
    padding: 12, borderWidth: 2, borderColor: LINE },
  camOptOn: { borderColor: ACCENT },
  camCheck: { position: 'absolute', top: 6, right: 6 },
  camTile: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#F1F5F4', alignItems: 'center', justifyContent: 'center' },
  camText: { fontSize: 16, fontWeight: '800', color: INK },
  camSub: { fontSize: 11.5, color: MUTED, fontWeight: '600' },
  espStatus: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  passiveCard: { backgroundColor: CARD, borderRadius: 22, padding: 14, marginBottom: 10, gap: 6,
    borderWidth: 1, borderColor: '#BFE6DE' },
  passiveHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  passiveTitle: { fontSize: 16, fontWeight: '900', color: INK },
  passiveSub: { fontSize: 12, color: MUTED, fontWeight: '600' },
  passiveEvent: { fontSize: 13, color: '#334155' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 16 },
  card: { width: '48%', backgroundColor: CARD, borderRadius: 28, paddingTop: 18, paddingBottom: 18, paddingHorizontal: 10,
    alignItems: 'center', borderWidth: 1, borderColor: LINE,
    shadowColor: INK, shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  tile: { width: 118, height: 118, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden' },
  cardSi: { color: INK, fontSize: 17, fontWeight: '800', textAlign: 'center', marginTop: 14, lineHeight: 24 },
  dueCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FEF3C7', borderRadius: 20, padding: 14,
    marginTop: 8, borderWidth: 1, borderColor: '#FCD34D' },
  dueText: { flex: 1, fontSize: 15, lineHeight: 22, color: '#78350F', fontWeight: '700' },
  badge: { position: 'absolute', top: 10, right: 10, backgroundColor: '#FEF3C7', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#B45309' },
  cardEn: { color: MUTED, fontSize: 12, fontWeight: '600', marginTop: 2 },
});
