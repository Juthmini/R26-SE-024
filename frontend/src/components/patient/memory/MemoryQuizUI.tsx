import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import axios from 'axios';
import Svg, { Circle, Ellipse, Path, G } from 'react-native-svg';
import { RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import {
  AI_URL, getPatientId, getPatientName, speak, startListening, stopSpeaking,
} from '../../../services/memoryAI';
import { getStoredRole, getStoredUser } from '../../../api/authApi';

// Storybook palette - warm paper, ink, and three soft accents.
const P = {
  paper: '#FBF5EA', card: '#FFFDF8', ink: '#22313A', soft: '#6B7A80', line: '#EADFCB',
  clay: '#E07A5F', sage: '#81B29A', teal: '#2A6F6A', honey: '#F2CC8F', honeyDeep: '#D9A441',
};
const MAX_LISTEN_S = 7;

type Media = { kind: 'photo' | 'reveal' | 'slideshow' | 'emoji' | 'calendar' | 'visit' | 'scene' | 'sequence' | 'hidden' | 'order' | 'none';
  urls?: string[]; emoji?: string; icon?: string; label_si?: string; box?: number[] };
type Choice = { si: string; en: string; image?: string; icon?: string };
type Question = { id: string; type: string; domain: string; prompt_si: string; prompt_en: string;
  hint_si: string; choices: Choice[]; media: Media; lead_si?: string };
type Mood = { key: string; emoji: string; si: string };
type Stage = 'free' | 'hint' | 'choice';
type Phase = 'loading' | 'talking' | 'mood' | 'waiting' | 'listening' | 'thinking' | 'done' | 'empty' | 'error';

// ─── Owl companion ──────────────────────────────────────────────────────────
function Owl({ mood, size = 92 }: { mood: 'talk' | 'listen' | 'happy' | 'idle'; size?: number }) {
  const bob = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    bob.stopAnimation();
    ring.stopAnimation();
    if (mood === 'talk' || mood === 'happy') {
      Animated.loop(Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: mood === 'happy' ? 260 : 380, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: mood === 'happy' ? 260 : 380, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])).start();
    } else bob.setValue(0);
    if (mood === 'listen') {
      ring.setValue(0);
      Animated.loop(Animated.timing(ring, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true })).start();
    }
  }, [mood, bob, ring]);
  const happy = mood === 'happy';
  return (
    <View style={{ width: size + 40, height: size + 40, alignItems: 'center', justifyContent: 'center' }}>
      {mood === 'listen' && (
        <Animated.View style={[styles.ring, { width: size + 30, height: size + 30, borderRadius: (size + 30) / 2,
          opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
          transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.35] }) }] }]} />
      )}
      <Animated.View style={{ transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, happy ? -8 : -4] }) }] }}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Path d="M22 30 L30 8 L40 26 Z" fill="#B5835A" />
          <Path d="M78 30 L70 8 L60 26 Z" fill="#B5835A" />
          <Ellipse cx="50" cy="56" rx="36" ry="38" fill="#C99A6E" />
          <Ellipse cx="50" cy="68" rx="22" ry="22" fill="#F3E3C8" />
          <G>
            <Circle cx="36" cy="44" r="14" fill="#FFFDF8" />
            <Circle cx="64" cy="44" r="14" fill="#FFFDF8" />
            {happy ? (
              <>
                <Path d="M28 46 Q36 36 44 46" stroke={P.ink} strokeWidth="3.5" fill="none" strokeLinecap="round" />
                <Path d="M56 46 Q64 36 72 46" stroke={P.ink} strokeWidth="3.5" fill="none" strokeLinecap="round" />
              </>
            ) : (
              <>
                <Circle cx={mood === 'listen' ? 38 : 36} cy="45" r="6.5" fill={P.ink} />
                <Circle cx={mood === 'listen' ? 66 : 64} cy="45" r="6.5" fill={P.ink} />
                <Circle cx={mood === 'listen' ? 40 : 38} cy="43" r="2" fill="#fff" />
                <Circle cx={mood === 'listen' ? 68 : 66} cy="43" r="2" fill="#fff" />
              </>
            )}
          </G>
          <Path d={mood === 'talk' ? 'M45 58 L55 58 L50 67 Z' : 'M45 58 L55 58 L50 64 Z'} fill={P.honeyDeep} />
          <Path d="M38 74 Q42 78 46 74 M54 74 Q58 78 62 74 M46 82 Q50 86 54 82" stroke="#D8C3A0" strokeWidth="2" fill="none" />
        </Svg>
      </Animated.View>
    </View>
  );
}

// ─── Question media ─────────────────────────────────────────────────────────
function RevealPhoto({ url, box, revealed }: { url: string; box?: number[]; revealed: boolean }) {
  // Starts zoomed into the object, then slowly zooms out - a gentle "guess what" game.
  const z = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    z.setValue(0);
    Animated.timing(z, { toValue: 0.55, duration: 9000, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [url, z]);
  useEffect(() => {
    if (revealed) Animated.timing(z, { toValue: 1, duration: 900, useNativeDriver: true }).start();
  }, [revealed, z]);
  const [w, setW] = useState(300);
  const cx = box ? (box[0] + box[2]) / 2 : 0.5;
  const cy = box ? (box[1] + box[3]) / 2 : 0.5;
  const h = w * 0.75;
  return (
    <View style={styles.mediaFrame} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Animated.Image source={{ uri: url }} resizeMode="cover" style={{
        width: w, height: h,
        transform: [
          { translateX: z.interpolate({ inputRange: [0, 1], outputRange: [(0.5 - cx) * w * 3.2, 0] }) },
          { translateY: z.interpolate({ inputRange: [0, 1], outputRange: [(0.5 - cy) * h * 3.2, 0] }) },
          { scale: z.interpolate({ inputRange: [0, 1], outputRange: [3.2, 1] }) },
        ] }} />
      <View style={styles.mediaBadge}><Text style={styles.mediaBadgeText}>🔍 හැංගිලා ඉන්නේ මොකක්ද?</Text></View>
    </View>
  );
}

function Slideshow({ urls }: { urls: string[] }) {
  const [i, setI] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const zoom = useRef(new Animated.Value(1)).current;
  const [plays, setPlays] = useState(0);
  useEffect(() => {
    let k = 0;
    let alive = true;
    const step = () => {
      if (!alive) return;
      zoom.setValue(1);
      Animated.parallel([
        Animated.sequence([
          Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.delay(1300),
          Animated.timing(fade, { toValue: k === urls.length - 1 ? 1 : 0.15, duration: 300, useNativeDriver: true }),
        ]),
        Animated.timing(zoom, { toValue: 1.12, duration: 1900, useNativeDriver: true }),
      ]).start(() => {
        if (!alive || k >= urls.length - 1) return;
        k += 1;
        setI(k);
        step();
      });
    };
    setI(0);
    step();
    return () => { alive = false; };
  }, [urls, plays, fade, zoom]);
  return (
    <View style={styles.mediaFrame}>
      <Animated.Image source={{ uri: urls[i] }} resizeMode="cover"
        style={{ width: '100%', aspectRatio: 4 / 3, opacity: fade, transform: [{ scale: zoom }] }} />
      <View style={styles.filmDots}>
        {urls.map((_, j) => <View key={j} style={[styles.filmDot, j === i && { backgroundColor: '#fff', width: 18 }]} />)}
      </View>
      <Pressable style={styles.replayBtn} onPress={() => setPlays((n) => n + 1)}>
        <Ionicons name="play" size={16} color="#fff" /><Text style={styles.replayText}>ආයෙත්</Text>
      </Pressable>
    </View>
  );
}

function CalendarArt() {
  const now = new Date();
  const months = ['ජනවාරි', 'පෙබරවාරි', 'මාර්තු', 'අප්‍රේල්', 'මැයි', 'ජූනි', 'ජූලි', 'අගෝස්තු', 'සැප්තැම්බර්', 'ඔක්තෝබර්', 'නොවැම්බර්', 'දෙසැම්බර්'];
  return (
    <View style={styles.calendar}>
      <View style={styles.calTop}><Text style={styles.calMonth}>{months[now.getMonth()]}</Text></View>
      <Text style={styles.calDay}>{now.getDate()}</Text>
      <Text style={styles.calQ}>? දවස</Text>
    </View>
  );
}

// "Someone came to see you" - a door with a question-mark visitor.
function VisitArt() {
  return (
    <View style={styles.artCard}>
      <Svg width={170} height={150} viewBox="0 0 170 150">
        <Ellipse cx="85" cy="140" rx="70" ry="7" fill="#EADFCB" />
        <Path d="M40 140 V30 Q40 14 56 14 H114 Q130 14 130 30 V140 Z" fill="#B5835A" />
        <Path d="M50 140 V34 Q50 24 60 24 H110 Q120 24 120 34 V140 Z" fill="#FBF5EA" />
        <Circle cx="85" cy="62" r="17" fill="#81B29A" />
        <Path d="M57 140 Q57 92 85 92 Q113 92 113 140 Z" fill="#81B29A" />
        <Path d="M79 56 Q79 49 85 49 Q91 49 91 55 Q91 60 85 62 V66" stroke="#FFFDF8" strokeWidth="4" fill="none" strokeLinecap="round" />
        <Circle cx="85" cy="73" r="2.6" fill="#FFFDF8" />
        <Circle cx="126" cy="86" r="4" fill="#D9A441" />
      </Svg>
    </View>
  );
}

function SceneArt({ icon, label }: { icon?: string; label?: string }) {
  return (
    <View style={styles.artCard}>
      <View style={styles.sceneCircle}>
        <Text style={{ fontSize: 54 }}>{icon || '🏠'}</Text>
        <View style={styles.sceneQ}><Text style={styles.sceneQText}>?</Text></View>
      </View>
      {!!label && <Text style={styles.emojiLabel}>{label}</Text>}
    </View>
  );
}

function HiddenPhoto({ url, box, revealed }: { url: string; box?: number[]; revealed: boolean }) {
  const [x1, y1, x2, y2] = box || [0.4, 0.4, 0.6, 0.6];
  const pad = 0.04;
  return (
    <View style={styles.mediaFrame}>
      <Image source={{ uri: url }} style={{ width: '100%', aspectRatio: 4 / 3 }} />
      {!revealed && (
        <View style={[styles.hideTile, {
          left: `${Math.max(0, x1 - pad) * 100}%`, top: `${Math.max(0, y1 - pad) * 100}%`,
          width: `${Math.min(1, x2 - x1 + 2 * pad) * 100}%`, height: `${Math.min(1, y2 - y1 + 2 * pad) * 100}%`,
        }]}>
          <Text style={styles.hideQ}>?</Text>
        </View>
      )}
    </View>
  );
}

function QuestionMedia({ media, revealed }: { media: Media; revealed: boolean }) {
  if (media.kind === 'visit') return <VisitArt />;
  if (media.kind === 'hidden' && media.urls?.[0]) return <HiddenPhoto url={media.urls[0]} box={media.box} revealed={revealed} />;
  if (media.kind === 'order') return null;
  if (media.kind === 'scene') return <SceneArt icon={media.icon} label={media.label_si} />;
  if (media.kind === 'sequence')
    return <View style={styles.artCard}><Text style={{ fontSize: 56 }}>⏳</Text><Text style={styles.emojiLabel}>මුලින්ම වුණේ?</Text></View>;
  if (media.kind === 'photo' && media.urls?.[0])
    return <View style={styles.mediaFrame}><Image source={{ uri: media.urls[0] }} style={{ width: '100%', aspectRatio: 4 / 3 }} /></View>;
  if (media.kind === 'reveal' && media.urls?.[0]) return <RevealPhoto url={media.urls[0]} box={media.box} revealed={revealed} />;
  if (media.kind === 'slideshow' && media.urls?.length) return <Slideshow urls={media.urls} />;
  if (media.kind === 'emoji')
    return (
      <View style={styles.emojiCard}>
        <Text style={{ fontSize: 64 }}>{media.emoji}</Text>
        {!!media.label_si && <Text style={styles.emojiLabel}>{media.label_si}</Text>}
      </View>
    );
  if (media.kind === 'calendar') return <CalendarArt />;
  return null;
}

// ─── Screen ─────────────────────────────────────────────────────────────────
export default function MemoryQuizUI() {
  const router = useRouter();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [phase, setPhase] = useState<Phase>('loading');
  const [sessionId, setSessionId] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [qi, setQi] = useState(0);
  const [stage, setStage] = useState<Stage>('free');
  const [bubble, setBubble] = useState('');
  const [heard, setHeard] = useState('');
  const [points, setPoints] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  // Photo-order game: the tapped order, how many are fixed by hints, and the right order once known.
  const [seq, setSeq] = useState<number[]>([]);
  const [locked, setLocked] = useState(0);
  const [rightOrder, setRightOrder] = useState<number[] | null>(null);
  const [correctIdx, setCorrectIdx] = useState<number | null>(null);
  const [happy, setHappy] = useState(false);
  const [left, setLeft] = useState(MAX_LISTEN_S);
  const [final, setFinal] = useState<{ stars: number; max_stars: number; say_si: string } | null>(null);
  const [moods, setMoods] = useState<Mood[]>([]);
  const [begun, setBegun] = useState(false); // questions start after the greeting and check-in
  const askedAt = useRef(0);
  const stopEarly = useRef(false);
  const alive = useRef(true);
  const starPop = useRef(new Animated.Value(0)).current;

  const say = useCallback(async (text: string) => {
    if (!alive.current) return;
    setBubble(text);
    setPhase('talking');
    await speak(text);
    if (alive.current) setPhase('waiting');
  }, []);

  const ask = useCallback(async (q: Question) => {
    setBegun(true);
    setStage('free');
    setPicked(null);
    setSeq([]);
    setLocked(0);
    setRightOrder(null);
    setCorrectIdx(null);
    setHeard('');
    // The bridge sentence first, so the game flows like a conversation.
    await say(q.lead_si ? `${q.lead_si} ${q.prompt_si}` : q.prompt_si);
    askedAt.current = Date.now();
  }, [say]);

  const start = useCallback(async () => {
    alive.current = true;
    setPhase('loading');
    setFinal(null);
    setPoints([]);
    setQi(0);
    setBegun(false);
    try {
      const pid = await getPatientId();
      if (!pid) throw new Error('no patient');
      const name = await getPatientName();
      const role = await getStoredRole();
      const user = role === 'patient' ? await getStoredUser() : null;
      const form = new FormData();
      form.append('patient_id', pid);
      form.append('name', name);
      // The login user's id links this score to the MMSE results (cognitive assessment).
      if (user?._id || user?.id) form.append('user_id', String(user._id || user.id));
      const res = await axios.post(`${AI_URL}/quiz/start`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 20000 });
      if (res.data.status === 'empty') {
        // Nothing captured yet - the game never invents questions.
        setBubble(res.data.say_si);
        setPhase('empty');
        await speak(res.data.say_si);
        return;
      }
      setSessionId(res.data.session_id);
      setQuestions(res.data.questions);
      setMoods(res.data.moods || []);
      await say(res.data.intro_si);
      if (alive.current) setPhase('mood'); // check-in before any question
    } catch {
      setPhase('error');
      setBubble('AI සේවාවට සම්බන්ධ වෙන්න බැහැ. ටිකකින් ආයෙත් උත්සාහ කරන්න.');
    }
  }, [ask, say]);

  useFocusEffect(useCallback(() => {
    start();
    return () => { alive.current = false; stopSpeaking(); recorder.stop().catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  const chooseMood = async (m: Mood) => {
    setPhase('thinking');
    try {
      const form = new FormData();
      form.append('session_id', sessionId);
      form.append('mood', m.key);
      const res = await axios.post(`${AI_URL}/quiz/mood`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 15000 });
      setQuestions(res.data.questions);
      await say(res.data.say_si);
      if (alive.current && res.data.questions.length) await ask(res.data.questions[0]);
    } catch {
      if (questions.length) await ask(questions[0]);
    }
  };

  const finish = useCallback(async (sid: string) => {
    try {
      const form = new FormData();
      form.append('session_id', sid);
      const res = await axios.post(`${AI_URL}/quiz/finish`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 15000 });
      setFinal(res.data);
      setPhase('done');
      setHappy(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await say(res.data.say_si);
      setPhase('done');
    } catch {
      setPhase('error');
    }
  }, [say]);

  const handle = useCallback(async (d: any) => {
    if (d.verdict === 'unclear') {
      await say(d.say_si);
      askedAt.current = Date.now();
      return;
    }
    if (d.verdict === 'correct') {
      setHappy(true);
      starPop.setValue(0);
      Animated.spring(starPop, { toValue: 1, friction: 4, useNativeDriver: true }).start();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    if (d.correct_choice != null) setCorrectIdx(d.correct_choice);
    if (d.lock) { setSeq(d.lock); setLocked(d.lock.length); }
    if (d.correct_order) setRightOrder(d.correct_order);
    if (d.next === 'hint') setStage('hint');
    if (d.next === 'choice') setStage('choice');
    await say(d.say_si);
    setHappy(false);
    askedAt.current = Date.now();
    if (d.next === 'next') {
      setPoints((p) => [...p, d.points || 0]);
      const nextI = qi + 1;
      if (nextI < questions.length) {
        setQi(nextI);
        await ask(questions[nextI]);
      } else {
        await finish(sessionId);
      }
    }
  }, [ask, finish, qi, questions, say, sessionId, starPop]);

  const post = useCallback(async (fields: Record<string, string>, file?: string) => {
    const form = new FormData();
    form.append('session_id', sessionId);
    form.append('q_index', String(qi));
    form.append('stage', stage);
    Object.entries(fields).forEach(([k, v]) => form.append(k, v));
    if (file) form.append('file', { uri: file, name: 'answer.m4a', type: 'audio/m4a' } as any);
    setPhase('thinking');
    try {
      const res = await axios.post(`${AI_URL}/quiz/answer`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 45000 });
      if (res.data.said) setHeard(res.data.said);
      await handle(res.data);
    } catch {
      await say('සමාවෙන්න, පොඩි ප්‍රශ්නයක් ආවා. ආයෙත් කියන්න.');
    }
  }, [handle, qi, say, sessionId, stage]);

  const listen = async () => {
    if (phase === 'listening') { stopEarly.current = true; return; }
    if (phase !== 'waiting') return;
    const ms = Date.now() - askedAt.current;
    try {
      stopEarly.current = false;
      await startListening(recorder);
      setPhase('listening');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      for (let s = MAX_LISTEN_S; s > 0 && !stopEarly.current && alive.current; s--) {
        setLeft(s);
        await new Promise((r) => setTimeout(r, 1000));
      }
      await recorder.stop();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      if (!alive.current) return;
      if (!recorder.uri) throw new Error('no audio');
      await post({ response_ms: String(ms) }, recorder.uri);
    } catch {
      setPhase('waiting');
      say('සමාවෙන්න, මයික් එක වැඩ කළේ නැහැ. පහළින් තෝරන්නත් පුළුවන්.');
    }
  };

  const choose = (i: number) => {
    if (phase !== 'waiting') return;
    setPicked(i);
    post({ choice: String(i), response_ms: String(Date.now() - askedAt.current) });
  };

  const tapOrder = (i: number) => {
    if (phase !== 'waiting' || !q || seq.includes(i)) return;
    const next = [...seq, i];
    setSeq(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (next.length === q.choices.length) {
      post({ order: JSON.stringify(next), response_ms: String(Date.now() - askedAt.current) });
    }
  };

  const dontKnow = () => {
    if (phase !== 'waiting') return;
    post({ dont_know: 'true', response_ms: String(Date.now() - askedAt.current) });
  };

  const q = questions[qi];
  const owlMood = happy ? 'happy' : phase === 'talking' ? 'talk' : phase === 'listening' ? 'listen' : 'idle';
  const busy = phase === 'talking' || phase === 'thinking' || phase === 'loading';

  // ─── Finished ────────────────────────────────────────────────────────────
  if (phase === 'done' && final) {
    const ratio = final.max_stars ? final.stars / final.max_stars : 0;
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.doneWrap}>
          <Owl mood="happy" size={130} />
          <Text style={styles.doneTitle}>සෙල්ලම ඉවරයි!</Text>
          <View style={styles.starRow}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Ionicons key={i} name={i < Math.round(ratio * 5) ? 'star' : 'star-outline'} size={38}
                color={i < Math.round(ratio * 5) ? P.honeyDeep : P.line} />
            ))}
          </View>
          <Text style={styles.doneStars}>තරු {final.stars} / {final.max_stars}</Text>
          <View style={styles.bubbleDone}><Text style={styles.bubbleText}>{final.say_si}</Text></View>
          <Pressable style={[styles.bigBtn, { backgroundColor: P.teal }]} onPress={() => router.replace('/patient/memory-story')}>
            <Ionicons name="book" size={22} color="#fff" /><Text style={styles.bigBtnText}>අද කතාව අහන්න</Text>
          </Pressable>
          <Pressable style={[styles.bigBtn, styles.ghostBtn]} onPress={() => router.back()}>
            <Text style={[styles.bigBtnText, { color: P.ink }]}>ඉවරයි</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.roundBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={P.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>මතක සෙල්ලම</Text>
          <Text style={styles.subtitle}>ඔයාගේම දවස ගැන පොඩි කතාබහක්</Text>
        </View>
      </View>
      {questions.length > 0 && (
        <View style={styles.progress}>
          {questions.map((_, i) => {
            const p = points[i];
            const done = p !== undefined;
            return (
              <View key={i} style={[styles.leaf,
                i === qi && !done && { borderColor: P.teal, borderWidth: 2.5 },
                done && { backgroundColor: p >= 2 ? P.sage : p === 1 ? P.honey : '#F1D9CF', borderColor: 'transparent' }]}>
                {done && <Ionicons name={p ? 'star' : 'ellipse-outline'} size={12} color={p ? '#fff' : P.clay} />}
              </View>
            );
          })}
        </View>
      )}

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.owlRow}>
          <Owl mood={owlMood} />
          <View style={styles.bubble}>
            <View style={styles.bubbleTail} />
            {phase === 'loading' ? <ActivityIndicator color={P.teal} /> : <Text style={styles.bubbleText}>{bubble}</Text>}
          </View>
        </View>

        {phase === 'mood' && (
          <View style={styles.moodGrid}>
            {moods.map((m) => (
              <Pressable key={m.key} onPress={() => chooseMood(m)}
                style={({ pressed }) => [styles.moodBtn, pressed && { transform: [{ scale: 0.96 }] }]}>
                <Text style={{ fontSize: 46 }}>{m.emoji}</Text>
                <Text style={styles.moodText}>{m.si}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {phase === 'empty' && (
          <View style={{ alignItems: 'center', marginTop: 10 }}>
            <SceneArt icon="📷" />
            <Pressable style={[styles.bigBtn, { backgroundColor: P.teal, marginTop: 18 }]} onPress={() => router.replace('/patient/remember-live')}>
              <Ionicons name="camera" size={22} color="#fff" /><Text style={styles.bigBtnText}>කැමරාව පටන් ගන්න</Text>
            </Pressable>
          </View>
        )}
        {q && begun && phase !== 'loading' && phase !== 'error' && phase !== 'empty' && (
          <>
            {!!q.lead_si && (
              <View style={styles.retryTag}>
                <Ionicons name="chatbubble-ellipses" size={14} color={P.teal} />
                <Text style={styles.retryText}>{q.lead_si}</Text>
              </View>
            )}
            <QuestionMedia key={q.id} media={q.media} revealed={q.type === 'hidden' ? correctIdx != null : stage !== 'free' || correctIdx != null} />
            {stage === 'hint' && (
              <View style={styles.hintCard}>
                <Ionicons name="bulb" size={20} color={P.honeyDeep} />
                <Text style={styles.hintText}>{q.hint_si}</Text>
              </View>
            )}
            {q.type !== 'order' && (stage === 'choice' || correctIdx != null) && q.choices.some((c) => c.image || c.icon) && (
              <View style={styles.grid}>
                {q.choices.map((c, i) => {
                  const isRight = correctIdx === i;
                  const isWrong = picked === i && correctIdx != null && correctIdx !== i;
                  const faded = correctIdx != null && !isRight && !isWrong;
                  return (
                    <Pressable key={i} onPress={() => choose(i)} disabled={busy || correctIdx != null}
                      style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.97 }] },
                        isRight && { borderColor: P.sage, backgroundColor: '#E2F1E8' },
                        isWrong && { borderColor: P.clay, backgroundColor: '#FBE6DF' },
                        faded && { opacity: 0.45 }]}>
                      {c.image
                        ? <Image source={{ uri: c.image }} style={styles.tileImg} />
                        : <View style={[styles.tileImg, styles.tileIcon]}><Text style={{ fontSize: 50 }}>{c.icon}</Text></View>}
                      <Text style={styles.tileText} numberOfLines={2}>{c.si}</Text>
                      {(isRight || isWrong) && (
                        <View style={[styles.tileMark, { backgroundColor: isRight ? P.sage : P.clay }]}>
                          <Ionicons name={isRight ? 'checkmark' : 'close'} size={18} color="#fff" />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
            {q.type !== 'order' && (stage === 'choice' || correctIdx != null) && q.choices.length > 0 && !q.choices.some((c) => c.image || c.icon) && (
              <View style={{ gap: 10, marginTop: 6 }}>
                {q.choices.map((c, i) => {
                  const isRight = correctIdx === i;
                  const isWrong = picked === i && correctIdx != null && correctIdx !== i;
                  return (
                    <Pressable key={i} onPress={() => choose(i)} disabled={busy || correctIdx != null}
                      style={({ pressed }) => [styles.choice, pressed && { transform: [{ scale: 0.98 }] },
                        isRight && { backgroundColor: '#E2F1E8', borderColor: P.sage },
                        isWrong && { backgroundColor: '#FBE6DF', borderColor: P.clay }]}>
                      <View style={[styles.choiceBadge, isRight && { backgroundColor: P.sage }, isWrong && { backgroundColor: P.clay }]}>
                        <Text style={styles.choiceBadgeText}>{isRight ? '✓' : ['අ', 'ආ', 'ඇ'][i]}</Text>
                      </View>
                      <Text style={styles.choiceText}>{c.si}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {q.type === 'order' && (
              <View style={styles.grid}>
                {q.choices.map((c, i) => {
                  const pos = (rightOrder || seq).indexOf(i);
                  const isLocked = !rightOrder && pos >= 0 && pos < locked;
                  return (
                    <Pressable key={i} disabled={busy || !!rightOrder || isLocked || phase !== 'waiting'}
                      onPress={() => tapOrder(i)}
                      style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.97 }] },
                        pos >= 0 && { borderColor: rightOrder ? P.sage : P.teal },
                        isLocked && { backgroundColor: '#E3F1EE' }]}>
                      {c.image
                        ? <Image source={{ uri: c.image }} style={styles.tileImg} />
                        : <View style={[styles.tileImg, styles.tileIcon]}><Text style={{ fontSize: 46 }}>{c.icon}</Text></View>}
                      <Text style={styles.tileText} numberOfLines={2}>{c.si}</Text>
                      {pos >= 0 && (
                        <View style={[styles.orderBadge, rightOrder && { backgroundColor: P.sage }]}>
                          <Text style={styles.orderBadgeText}>{pos + 1}</Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
            {q.type === 'order' && !rightOrder && seq.length > locked && (
              <Pressable onPress={() => setSeq((x) => x.slice(0, locked))} style={styles.orderReset}>
                <Ionicons name="refresh" size={16} color={P.soft} />
                <Text style={styles.sideText}>ආයෙත් පටන් ගන්න</Text>
              </Pressable>
            )}
            {!!heard && (
              <Text style={styles.heard}>ඔයා කිව්වා: “{heard}”</Text>
            )}
          </>
        )}
        {happy && (
          <Animated.View pointerEvents="none" style={[styles.starBurst, {
            opacity: starPop.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1] }),
            transform: [{ scale: starPop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}>
            <Text style={{ fontSize: 46 }}>⭐</Text>
          </Animated.View>
        )}
        {phase === 'error' && (
          <Pressable style={[styles.bigBtn, { backgroundColor: P.teal, marginTop: 20 }]} onPress={start}>
            <Ionicons name="refresh" size={22} color="#fff" /><Text style={styles.bigBtnText}>ආයෙත් උත්සාහ කරන්න</Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Answer bar */}
      {q && begun && phase !== 'error' && phase !== 'empty' && (
        <View style={styles.answerBar}>
          <Pressable onPress={dontKnow} disabled={phase !== 'waiting'} style={[styles.sideBtn, phase !== 'waiting' && { opacity: 0.4 }]}>
            <Ionicons name="help" size={22} color={P.soft} />
            <Text style={styles.sideText}>මතක නැහැ</Text>
          </Pressable>
          <Pressable onPress={listen} disabled={busy || q.type === 'order'}
            style={[styles.mic, phase === 'listening' && { backgroundColor: P.clay }, (busy || q.type === 'order') && { opacity: 0.35 }]}>
            {phase === 'thinking' ? <ActivityIndicator color="#fff" size="large" />
              : phase === 'listening' ? <Text style={styles.micCount}>{left}</Text>
              : <Ionicons name="mic" size={40} color="#fff" />}
          </Pressable>
          <View style={styles.sideBtn}>
            <Text style={styles.micHint}>
              {phase === 'listening' ? 'අහගෙන ඉන්නවා…\nඉවර නම් ඔබන්න'
                : phase === 'thinking' ? 'හිතනවා…'
                : phase === 'talking' ? 'අහගෙන ඉන්න'
                : q.type === 'order' ? 'පින්තූර\nපිළිවෙළට ඔබන්න'
                : stage === 'choice' ? 'කියන්න,\nනැත්නම් තෝරන්න' : 'ඔබලා\nකියන්න'}
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: P.paper },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 6 },
  roundBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: P.card, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: P.line },
  title: { fontSize: 24, fontWeight: '800', color: P.ink, letterSpacing: 0.2 },
  subtitle: { fontSize: 13, color: P.soft, marginTop: 1 },
  progress: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingTop: 14 },
  leaf: { width: 26, height: 26, borderRadius: 13, borderTopLeftRadius: 4, borderWidth: 1.5, borderColor: P.line,
    backgroundColor: P.card, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 18, paddingBottom: 40 },
  owlRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  ring: { position: 'absolute', borderWidth: 3, borderColor: P.clay },
  bubble: { flex: 1, backgroundColor: P.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: P.line,
    minHeight: 70, justifyContent: 'center', marginLeft: -4,
    shadowColor: '#8A6D45', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  bubbleTail: { position: 'absolute', left: -7, top: 28, width: 14, height: 14, backgroundColor: P.card,
    borderLeftWidth: 1, borderBottomWidth: 1, borderColor: P.line, transform: [{ rotate: '45deg' }] },
  bubbleText: { fontSize: 18, lineHeight: 28, color: P.ink },
  mediaFrame: { borderRadius: 26, overflow: 'hidden', backgroundColor: '#E9DFCC', marginBottom: 12,
    borderWidth: 5, borderColor: P.card, shadowColor: '#8A6D45', shadowOpacity: 0.15, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  mediaBadge: { position: 'absolute', left: 12, top: 12, backgroundColor: 'rgba(34,49,58,0.75)', borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 5 },
  mediaBadgeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  filmDots: { position: 'absolute', bottom: 12, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  filmDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.55)' },
  replayBtn: { position: 'absolute', right: 12, top: 12, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(34,49,58,0.75)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  replayText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  emojiCard: { alignSelf: 'center', width: 180, height: 180, borderRadius: 90, backgroundColor: '#F6EAD3',
    alignItems: 'center', justifyContent: 'center', marginVertical: 8, borderWidth: 6, borderColor: P.card },
  emojiLabel: { fontSize: 16, fontWeight: '700', color: P.ink, marginTop: 4 },
  calendar: { alignSelf: 'center', width: 170, borderRadius: 22, backgroundColor: P.card, overflow: 'hidden',
    borderWidth: 1, borderColor: P.line, marginVertical: 8, alignItems: 'center', paddingBottom: 12 },
  calTop: { alignSelf: 'stretch', backgroundColor: P.clay, paddingVertical: 8, alignItems: 'center' },
  calMonth: { color: '#fff', fontWeight: '800', fontSize: 16 },
  calDay: { fontSize: 64, fontWeight: '800', color: P.ink, marginTop: 4 },
  calQ: { fontSize: 15, color: P.soft, fontWeight: '600' },
  hintCard: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#FCF0D8', borderRadius: 18,
    padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#F1DDB0' },
  hintText: { flex: 1, fontSize: 17, color: P.ink, lineHeight: 25 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: P.card, borderRadius: 20,
    paddingVertical: 16, paddingHorizontal: 16, borderWidth: 2, borderColor: P.line },
  choiceBadge: { width: 38, height: 38, borderRadius: 19, backgroundColor: P.ink, alignItems: 'center', justifyContent: 'center' },
  choiceBadgeText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  choiceText: { flex: 1, fontSize: 20, fontWeight: '700', color: P.ink },
  moodGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, marginTop: 6 },
  moodBtn: { width: '48.5%', backgroundColor: P.card, borderRadius: 24, paddingVertical: 20, alignItems: 'center', gap: 6,
    borderWidth: 2, borderColor: P.line },
  moodText: { fontSize: 18, fontWeight: '800', color: P.ink },
  hideTile: { position: 'absolute', backgroundColor: '#2A6F6A', borderRadius: 14, borderWidth: 3, borderColor: '#FFFDF8',
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  hideQ: { color: '#FFFDF8', fontSize: 40, fontWeight: '900' },
  orderBadge: { position: 'absolute', top: 12, left: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: '#2A6F6A',
    alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff' },
  orderBadgeText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  orderReset: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, marginTop: 6 },
  tile: { width: '48.5%', backgroundColor: P.card, borderRadius: 22, padding: 8, borderWidth: 2.5, borderColor: P.line,
    shadowColor: '#8A6D45', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  tileImg: { width: '100%', aspectRatio: 1, borderRadius: 16, backgroundColor: '#EFE5D2' },
  tileIcon: { alignItems: 'center', justifyContent: 'center' },
  tileText: { fontSize: 17, fontWeight: '800', color: P.ink, textAlign: 'center', marginTop: 8, marginBottom: 4 },
  tileMark: { position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  artCard: { alignSelf: 'center', alignItems: 'center', marginVertical: 6 },
  sceneCircle: { width: 150, height: 150, borderRadius: 75, backgroundColor: '#F6EAD3', alignItems: 'center',
    justifyContent: 'center', borderWidth: 6, borderColor: P.card },
  sceneQ: { position: 'absolute', right: 4, top: 4, width: 40, height: 40, borderRadius: 20, backgroundColor: P.clay,
    alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: P.card },
  sceneQText: { color: '#fff', fontSize: 22, fontWeight: '900' },
  retryTag: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: '#E3F1EE',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 10 },
  retryText: { color: P.teal, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  heard: { textAlign: 'center', color: P.soft, fontSize: 15, marginTop: 12, fontStyle: 'italic' },
  starBurst: { position: 'absolute', alignSelf: 'center', top: 30 },
  answerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22,
    paddingTop: 12, paddingBottom: 18, backgroundColor: P.card, borderTopLeftRadius: 30, borderTopRightRadius: 30,
    borderTopWidth: 1, borderColor: P.line },
  mic: { width: 92, height: 92, borderRadius: 46, backgroundColor: P.teal, alignItems: 'center', justifyContent: 'center',
    shadowColor: P.teal, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  micCount: { color: '#fff', fontSize: 34, fontWeight: '800' },
  sideBtn: { width: 92, alignItems: 'center', gap: 4 },
  sideText: { fontSize: 13, color: P.soft, fontWeight: '600' },
  micHint: { fontSize: 13, color: P.soft, textAlign: 'center', fontWeight: '600', lineHeight: 18 },
  doneWrap: { alignItems: 'center', padding: 24, paddingTop: 40 },
  doneTitle: { fontSize: 30, fontWeight: '800', color: P.ink, marginTop: 8 },
  starRow: { flexDirection: 'row', gap: 6, marginTop: 14 },
  doneStars: { fontSize: 16, color: P.soft, marginTop: 8, fontWeight: '600' },
  bubbleDone: { backgroundColor: P.card, borderRadius: 22, padding: 18, borderWidth: 1, borderColor: P.line,
    marginTop: 20, marginBottom: 24, alignSelf: 'stretch' },
  bigBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 22,
    paddingVertical: 18, alignSelf: 'stretch', marginBottom: 12 },
  ghostBtn: { backgroundColor: P.card, borderWidth: 1.5, borderColor: P.line },
  bigBtnText: { color: '#fff', fontSize: 19, fontWeight: '800' },
});
