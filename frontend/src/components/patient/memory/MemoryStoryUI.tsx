import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import axios from 'axios';
import { AI_URL, Lang, Person, getPatientId, speak, stopSpeaking } from '../../../services/memoryAI';
import { QuizArt, StoryArt } from './findThings/Illustrations';
import { useVideoPlayer, VideoView } from 'expo-video';

type Story = {
  title: string; story: string; photos: string[]; people: Person[]; moment_count?: number;
  date?: string; auto?: boolean; minutes_with_people?: number;
};
type Day = { date: string; title: string; cover: string; auto: boolean };
type Said = { si: string; en?: string };
type DayRecord = {
  conversations: { id: string; time: string; seconds?: number; summary_si: string; relation_si?: string; name?: string;
    photo_url?: string; visitor_asked?: Said[]; patient_said?: Said[]; promises?: Said[] }[];
  games: { time: string; score: number; stars: number; max_stars: number; mood?: string;
    questions: { prompt_si: string; answer_si: string; said: string; points: number; image?: string | null }[] }[];
  counts: { moments: number; visits: number; finds: number };
};
const MOOD_EMOJI: Record<string, string> = { happy: '😊', ok: '🙂', tired: '😴', sad: '😢' };
const HELP = [
  { label: 'අමතක වුණා', color: '#C2410C' }, { label: 'තෝරලා', color: '#D9A441' },
  { label: 'ඉඟියෙන්', color: '#2FA597' }, { label: 'තනියම', color: '#0B6E66' },
];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function MemoryStoryUI() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('si');
  const [date, setDate] = useState(today());
  const [days, setDays] = useState<Day[]>([]);
  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [invite, setInvite] = useState(false);
  const [record, setRecord] = useState<DayRecord | null>(null);
  const stopped = useRef(false);
  // Video diary of the selected day: story narration over the day's photos and visitors.
  const [video, setVideo] = useState<{ state: 'idle' | 'making' | 'ready' | 'error'; url?: string; msg?: string }>({ state: 'idle' });
  const player = useVideoPlayer(null, (p) => { p.loop = false; });

  const load = useCallback(async (l: Lang, d: string, refresh = false) => {
    setLoading(true);
    stopSpeaking();
    setSpeaking(false);
    setVideo({ state: 'idle' });
    try {
      const pid = await getPatientId();
      const [res, book] = await Promise.all([
        refresh
          ? axios.post(`${AI_URL}/generate-story-now/${pid}`, (() => { const f = new FormData(); f.append('lang', l); return f; })(),
            { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 40000 })
          : axios.get(`${AI_URL}/memory-story/${pid}`, { params: { lang: l, date: d }, timeout: 40000 }),
        axios.get(`${AI_URL}/memory-stories/${pid}`, { timeout: 10000 }).catch(() => null),
      ]);
      setStory(res.data.story ? res.data : { title: '', story: res.data.message || '', photos: [], people: [] });
      if (book) setDays(book.data.days || []);
      // Everything kept for this day: visits & talks, every game question and answer.
      axios.get(`${AI_URL}/day-record/${pid}`, { params: { date: d }, timeout: 10000 })
        .then((r) => setRecord(r.data)).catch(() => setRecord(null));
    } catch {
      setStory({ title: '', story: l === 'si' ? 'කතාව ගේන්න බැරි වුණා. AI සේවාව බලන්න.' : 'Could not load the story.', photos: [], people: [] });
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(lang, date); return () => stopSpeaking(); }, [load, lang, date]));

  const dayLabel = (d: string) => {
    if (d === today()) return lang === 'si' ? 'අද' : 'Today';
    const [, m, dd] = d.split('-');
    return `${dd}/${m}`;
  };
  const dayChips = days.some((d) => d.date === today()) ? days : [{ date: today(), title: '', cover: '', auto: false }, ...days];

  const makeVideo = async () => {
    stopSpeaking();
    setVideo({ state: 'making' });
    try {
      const pid = await getPatientId();
      const res = await axios.get(`${AI_URL}/memory-video/${pid}`, { params: { date }, timeout: 400000 });
      if (res.data.status !== 'success') throw new Error(res.data.message);
      const url = `${AI_URL}${res.data.video_url}`;
      setVideo({ state: 'ready', url });
      await player.replaceAsync(url);
      player.play();
    } catch (e: any) {
      setVideo({ state: 'error', msg: lang === 'si' ? 'වීඩියෝ එක හදන්න බැරි වුණා. පස්සේ ආයෙත් උත්සාහ කරන්න.' : 'Could not make the video.' });
    }
  };

  const play = async () => {
    if (!story) return;
    if (speaking) {
      stopped.current = true;
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    stopped.current = false;
    setInvite(false);
    setSpeaking(true);
    await speak(`${story.title ? story.title + '. ' : ''}${story.story}`, lang);
    setSpeaking(false);
    // Story heard to the end -> gently offer the memory game about it (the patient chooses).
    if (!stopped.current && date === today() && (story.photos?.length || story.people?.length)) {
      setInvite(true);
      speak(lang === 'si' ? 'කතාව ඉවරයි! දැන් ඒ කතාව ගැන පොඩි මතක සෙල්ලමක් කරමුද?' : 'That was your day! Shall we play a little memory game about it?', lang);
    }
  };

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#0f172a" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>අද මතක කතාව</Text>
            <Text style={s.sub}>Today's memory story</Text>
          </View>
          <View style={s.langSwitch}>
            {(['si', 'en'] as Lang[]).map((l) => (
              <TouchableOpacity key={l} style={[s.langBtn, lang === l && s.langOn]} onPress={() => setLang(l)}>
                <Text style={[s.langText, lang === l && { color: '#fff' }]}>{l === 'si' ? 'සිං' : 'EN'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.days}>
          {dayChips.map((d) => (
            <TouchableOpacity key={d.date} style={[s.day, d.date === date && s.dayOn]} onPress={() => setDate(d.date)}>
              {d.cover ? <Image source={{ uri: d.cover }} style={s.dayImg} /> : <Ionicons name="book" size={18} color={d.date === date ? '#fff' : '#db2777'} />}
              <Text style={[s.dayText, d.date === date && { color: '#fff' }]}>{dayLabel(d.date)}</Text>
              {d.auto && <Ionicons name="moon" size={12} color={d.date === date ? '#fff' : '#a855f7'} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={s.nightly}>
          🌙 {lang === 'si' ? 'හැමදාම රෑ 8ට ඔබේ දවසේ කතාව ඉබේම ලියවෙනවා.' : 'Every night at 8 PM your day is written into a story automatically.'}
        </Text>

        {loading || !story ? (
          <View style={s.loading}>
            <StoryArt size={120} />
            <ActivityIndicator size="large" color="#db2777" />
            <Text style={s.loadingText}>ඔබේ දවසේ කතාව ලියනවා...</Text>
          </View>
        ) : (
          <>
            {story.photos.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.photos}>
                {story.photos.map((u, i) => <Image key={`${u}-${i}`} source={{ uri: u }} style={s.photo} />)}
              </ScrollView>
            )}

            <View style={s.storyCard}>
              <View style={s.storyHead}>
                <StoryArt size={56} />
                <Text style={s.storyTitle}>{story.title || (lang === 'si' ? 'ඔබේ දවස' : 'Your day')}</Text>
              </View>
              {story.auto && <Text style={s.autoBadge}>🌙 {lang === 'si' ? 'රෑ 8ට ඉබේම ලියපු කතාව' : 'Written automatically at 8 PM'}</Text>}
              <Text style={s.storyText}>{story.story}</Text>
              {!!story.minutes_with_people && (
                <Text style={s.minutes}>👨‍👩‍👧 {lang === 'si' ? `අද ආදරණීයයන් එක්ක විනාඩි ${story.minutes_with_people}ක්` : `${story.minutes_with_people} min with loved ones today`}</Text>
              )}
            </View>

            {story.people.length > 0 && (
              <View style={s.peopleRow}>
                {story.people.map((p) => (
                  <View key={p.id} style={s.personChip}>
                    {p.photo_url ? <Image source={{ uri: p.photo_url }} style={s.personImg} /> : null}
                    <Text style={s.personText}>{p.relation_si}</Text>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity style={[s.play, speaking && { backgroundColor: '#475569' }]} onPress={play}>
              <Ionicons name={speaking ? 'stop' : 'play'} size={26} color="#fff" />
              <Text style={s.playText}>{speaking ? 'නවත්තන්න' : lang === 'si' ? 'කතාව අහන්න' : 'Listen to the story'}</Text>
            </TouchableOpacity>
            {invite && (
              <View style={s.invite}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <QuizArt size={64} />
                  <Text style={s.inviteText}>
                    {lang === 'si' ? 'කතාව ඉවරයි! දැන් ඒ කතාව ගැන පොඩි මතක සෙල්ලමක් කරමුද?' : 'Shall we play a little memory game about your day?'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <TouchableOpacity style={[s.quizBtn, { flex: 1, marginTop: 0 }]}
                    onPress={() => { setInvite(false); stopSpeaking(); router.push('/patient/memory-quiz' as any); }}>
                    <Text style={s.quizText}>{lang === 'si' ? 'ඔව්, කරමු!' : 'Yes, let’s play'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.laterBtn} onPress={() => { setInvite(false); stopSpeaking(); }}>
                    <Text style={s.laterText}>{lang === 'si' ? 'පස්සේ' : 'Later'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {date === today() && !invite && (
              <TouchableOpacity style={s.quizBtn} onPress={() => router.push('/patient/memory-quiz' as any)}>
                <Text style={{ fontSize: 22 }}>🦉</Text>
                <Text style={s.quizText}>{lang === 'si' ? 'කතාව ගැන මතක සෙල්ලමක් කරමු' : 'Play a memory game about today'}</Text>
              </TouchableOpacity>
            )}
            {date === today() && (
              <TouchableOpacity style={s.videoBtn} onPress={() => load(lang, date, true)}>
                <Ionicons name="sparkles" size={20} color="#be185d" />
                <Text style={s.videoText}>{lang === 'si' ? 'දැන්ම කතාව ලියන්න' : 'Write today’s story now'}</Text>
              </TouchableOpacity>
            )}
            {video.state === 'ready' && (
              <View style={s.videoCard}>
                <VideoView player={player} style={s.videoView} nativeControls contentFit="contain" />
              </View>
            )}
            {video.state === 'error' && <Text style={s.videoErr}>{video.msg}</Text>}
            <TouchableOpacity style={s.videoBtn} onPress={makeVideo} disabled={video.state === 'making'}>
              {video.state === 'making' ? <ActivityIndicator color="#be185d" /> : <Ionicons name="film" size={20} color="#be185d" />}
              <Text style={s.videoText}>
                {video.state === 'making'
                  ? (lang === 'si' ? 'වීඩියෝ එක හදනවා... (විනාඩියක් විතර)' : 'Making the video... (about a minute)')
                  : (lang === 'si' ? 'වීඩියෝ දින සටහන' : 'Video diary')}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {record && (
          <View style={s.recordWrap}>
            <Text style={s.recordTitle}>📒 {dayLabel(date)} දවසේ සටහන</Text>
            <View style={s.countRow}>
              <View style={s.countBox}><Text style={s.countNum}>{record.counts.moments}</Text><Text style={s.countLbl}>මතක</Text></View>
              <View style={s.countBox}><Text style={s.countNum}>{record.counts.visits}</Text><Text style={s.countLbl}>ආපු අය</Text></View>
              <View style={s.countBox}><Text style={s.countNum}>{record.counts.finds}</Text><Text style={s.countLbl}>හොයපු වාර</Text></View>
            </View>

            {record.conversations.length > 0 && <Text style={s.recordSection}>💬 කතා කරපු දේවල්</Text>}
            {record.conversations.map((c) => (
              <View key={c.id} style={s.recCard}>
                <View style={s.recHead}>
                  {c.photo_url ? <Image source={{ uri: c.photo_url }} style={s.recFace} /> : <Text style={{ fontSize: 26 }}>🙂</Text>}
                  <Text style={s.recWho}>{c.relation_si}{c.name && c.name !== c.relation_si ? ` ${c.name}` : ''} · {c.time.slice(11, 16)}</Text>
                </View>
                <Text style={s.recText}>{c.summary_si}</Text>
                {c.visitor_asked?.map((x, i) => <Text key={`a${i}`} style={s.recLine}>❓ එයා ඇහුවා: {x.si}</Text>)}
                {c.patient_said?.map((x, i) => <Text key={`s${i}`} style={s.recLine}>🗣 ඔයා කිව්වා: {x.si}</Text>)}
                {c.promises?.map((x, i) => <Text key={`p${i}`} style={[s.recLine, { color: '#8A5A12' }]}>📅 {x.si}</Text>)}
              </View>
            ))}

            {record.games.length > 0 && <Text style={s.recordSection}>🦉 මතක සෙල්ලම</Text>}
            {record.games.map((g, gi) => (
              <View key={gi} style={s.recCard}>
                <Text style={s.recWho}>
                  {g.mood ? `${MOOD_EMOJI[g.mood] || ''} ` : ''}{g.time} · තරු {g.stars}/{g.max_stars} · {Math.round(g.score)}/100
                </Text>
                {g.questions.map((q, qi) => (
                  <View key={qi} style={s.qRow}>
                    {q.image ? <Image source={{ uri: q.image }} style={s.qImg} /> : null}
                    <View style={{ flex: 1 }}>
                      <Text style={s.qPrompt}>{q.prompt_si}</Text>
                      {!!q.said && <Text style={s.qSaid}>ඔයාගේ උත්තරය: {q.said}</Text>}
                      <Text style={s.qAnswer}>හරි උත්තරය: {q.answer_si}</Text>
                    </View>
                    <View style={[s.qBadge, { backgroundColor: HELP[q.points]?.color || '#94a3b8' }]}>
                      <Text style={s.qBadgeText}>{HELP[q.points]?.label}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ))}
            {record.conversations.length === 0 && record.games.length === 0 && (
              <Text style={s.recEmpty}>මේ දවසේ කතාබහ හරි මතක සෙල්ලම් හරි නැහැ.</Text>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff7fb' },
  scroll: { padding: 20, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  backBtn: { width: 46, height: 46, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#fbcfe8' },
  title: { fontSize: 24, fontWeight: '900', color: '#0f172a' },
  sub: { fontSize: 13, color: '#be185d', fontWeight: '700' },
  langSwitch: { flexDirection: 'row', backgroundColor: '#fce7f3', borderRadius: 14, padding: 3 },
  langBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 11 },
  langOn: { backgroundColor: '#db2777' },
  langText: { fontWeight: '900', color: '#be185d' },
  loading: { alignItems: 'center', gap: 14, paddingVertical: 40 },
  loadingText: { fontSize: 16, fontWeight: '800', color: '#9d174d' },
  photos: { gap: 12, paddingBottom: 16 },
  photo: { width: 200, height: 150, borderRadius: 20, backgroundColor: '#fce7f3' },
  storyCard: { backgroundColor: '#fff', borderRadius: 26, padding: 20, borderWidth: 1, borderColor: '#fbcfe8', marginBottom: 16 },
  storyHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  storyTitle: { fontSize: 21, fontWeight: '900', color: '#9d174d', flex: 1 },
  storyText: { fontSize: 19, lineHeight: 31, color: '#1f2937', fontWeight: '500' },
  peopleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  personChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ffedd5', borderRadius: 18, paddingRight: 14, paddingLeft: 4, paddingVertical: 4 },
  personImg: { width: 34, height: 34, borderRadius: 17 },
  personText: { fontWeight: '900', color: '#9a3412', fontSize: 15 },
  play: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#db2777', borderRadius: 20, paddingVertical: 18 },
  playText: { color: '#fff', fontWeight: '900', fontSize: 18 },
  days: { gap: 8, paddingBottom: 8 },
  day: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1.5, borderColor: '#fbcfe8' },
  dayOn: { backgroundColor: '#db2777', borderColor: '#db2777' },
  dayImg: { width: 24, height: 24, borderRadius: 7 },
  dayText: { fontWeight: '900', color: '#9d174d' },
  nightly: { color: '#7e22ce', fontWeight: '700', fontSize: 13, marginBottom: 14 },
  autoBadge: { color: '#7e22ce', fontWeight: '800', fontSize: 13, marginBottom: 8 },
  minutes: { marginTop: 12, color: '#c2410c', fontWeight: '800', fontSize: 15 },
  videoBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 18, paddingVertical: 14, marginTop: 10, borderWidth: 2, borderColor: '#fbcfe8' },
  videoText: { color: '#be185d', fontWeight: '900', fontSize: 16 },
  recordWrap: { marginTop: 26, borderTopWidth: 1, borderColor: '#fbcfe8', paddingTop: 18 },
  recordTitle: { fontSize: 19, fontWeight: '900', color: '#0f172a', marginBottom: 12 },
  countRow: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  countBox: { flex: 1, backgroundColor: '#fff', borderRadius: 16, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#fce7f3' },
  countNum: { fontSize: 22, fontWeight: '900', color: '#be185d' },
  countLbl: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  recordSection: { fontSize: 16, fontWeight: '900', color: '#334155', marginTop: 16, marginBottom: 8 },
  recCard: { backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#fce7f3' },
  recHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  recFace: { width: 36, height: 36, borderRadius: 18 },
  recWho: { fontSize: 14.5, fontWeight: '800', color: '#0f172a' },
  recText: { fontSize: 15.5, lineHeight: 23, color: '#1e293b' },
  recLine: { fontSize: 14, color: '#475569', marginTop: 4, lineHeight: 20 },
  recEmpty: { color: '#94a3b8', textAlign: 'center', marginTop: 8 },
  qRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderColor: '#f1f5f9' },
  qImg: { width: 44, height: 44, borderRadius: 10 },
  qPrompt: { fontSize: 14.5, fontWeight: '700', color: '#0f172a', lineHeight: 21 },
  qSaid: { fontSize: 13.5, color: '#475569', marginTop: 3 },
  qAnswer: { fontSize: 13.5, color: '#0B6E66', fontWeight: '700', marginTop: 2 },
  qBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  qBadgeText: { color: '#fff', fontSize: 11.5, fontWeight: '800' },
  videoCard: { marginTop: 14, borderRadius: 22, overflow: 'hidden', backgroundColor: '#000' },
  videoView: { width: '100%', aspectRatio: 16 / 9 },
  videoErr: { color: '#b91c1c', textAlign: 'center', marginTop: 10, fontWeight: '700' },
  quizBtn: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 18, paddingVertical: 16, marginTop: 10, backgroundColor: '#2A6F6A' },
  quizText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  invite: { marginTop: 14, backgroundColor: '#FBF5EA', borderRadius: 22, padding: 16, borderWidth: 1.5, borderColor: '#EADFCB' },
  inviteText: { flex: 1, fontSize: 17, lineHeight: 25, fontWeight: '700', color: '#22313A' },
  laterBtn: { paddingHorizontal: 22, borderRadius: 18, borderWidth: 1.5, borderColor: '#EADFCB', backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center' },
  laterText: { color: '#6B7A80', fontWeight: '800', fontSize: 16 },
});
