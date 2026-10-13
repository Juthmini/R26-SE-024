import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import axios from 'axios';
import { AI_URL, getPatientId, speak, stopSpeaking, timeAgo } from '../../../services/memoryAI';
import { TalkArt } from './findThings/Illustrations';

type Talk = {
  id: string; time: string; seconds?: number; summary_si: string; summary_en: string; mood?: string;
  topics: { si: string; en: string }[]; promises: { si: string; en: string; when_si?: string }[];
  relation_si?: string; name?: string; photo_url?: string;
  visitor_asked?: { si: string }[]; patient_said?: { si: string }[];
};

const MOOD: Record<string, string> = { happy: '😊', calm: '🙂', sad: '😢', worried: '😟' };

// How a visit becomes a memory - shown so the family understands exactly what
// is (and is not) kept.
const STEPS = [
  { icon: 'scan-circle' as const, si: 'කැමරාව පවුලේ කෙනාව හඳුනාගන්නවා', sub: 'අවසර දීපු පවුලේ අය - caregiver දැම්මොත් ඕනෑම අමුත්තෙක්' },
  { icon: 'mic' as const, si: 'කතාබහ තත්පර 30 කෑලි වලින් අහනවා', sub: 'Audio එක එවෙලේම මකනවා - save වෙන්නේ නැහැ' },
  { icon: 'create' as const, si: 'එයා ගියාම කෙටි සාරාංශයක් ලියනවා', sub: 'එයා ඇහුව දේ, ඔයා කිව්ව දේ, පොරොන්දු - සම්පූර්ණ කතාව නෙවෙයි' },
  { icon: 'moon' as const, si: 'රෑට කතාවටයි මතක සෙල්ලමටයි එකතු වෙනවා', sub: '"කමල් ආයෙත් එනවා කිව්වේ කවදද?"' },
];

export default function VisitTalksUI() {
  const router = useRouter();
  const [talks, setTalks] = useState<Talk[] | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    (async () => {
      const pid = await getPatientId();
      if (!pid) return setTalks([]);
      try {
        const res = await axios.get(`${AI_URL}/conversations/${pid}`, { timeout: 10000 });
        setTalks(res.data.conversations || []);
      } catch {
        setTalks([]);
      }
    })();
    return () => stopSpeaking();
  }, []));

  const listen = async (t: Talk) => {
    if (playing === t.id) { stopSpeaking(); return setPlaying(null); }
    setPlaying(t.id);
    const promise = t.promises?.length ? ` ${t.promises.map((p) => p.si).join('. ')}.` : '';
    await speak(`${t.summary_si}${promise}`);
    setPlaying(null);
  };

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#0F2A24" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>පවුලේ අය එක්ක කතාබහ</Text>
            <Text style={s.sub}>Visit conversations</Text>
          </View>
          <TalkArt size={58} />
        </View>

        <View style={s.howCard}>
          <Text style={s.howTitle}>මේක වැඩ කරන්නේ මෙහෙමයි</Text>
          {STEPS.map((st, i) => (
            <View key={st.si} style={s.step}>
              <View style={s.stepLeft}>
                <View style={s.stepIcon}><Ionicons name={st.icon} size={20} color="#0F9D8A" /></View>
                {i < STEPS.length - 1 && <View style={s.stepLine} />}
              </View>
              <View style={{ flex: 1, paddingBottom: 14 }}>
                <Text style={s.stepText}>{st.si}</Text>
                <Text style={s.stepSub}>{st.sub}</Text>
              </View>
            </View>
          ))}
          <TouchableOpacity style={s.consentLink} onPress={() => router.push('/patient/family' as any)}>
            <Ionicons name="shield-checkmark" size={16} color="#0F9D8A" />
            <Text style={s.consentLinkText}>අවසර දෙන්න / වෙනස් කරන්න (caregiver)</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.section}>කතා කරපු දේවල්</Text>
        {talks === null ? (
          <ActivityIndicator color="#0F9D8A" style={{ marginTop: 20 }} />
        ) : talks.length === 0 ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 40 }}>💬</Text>
            <Text style={s.emptyText}>තවම කතාබහ සටහන් නැහැ</Text>
            <Text style={s.emptySub}>පවුලේ කෙනෙක්ට අවසර දීලා, එයා ආවම "මතක තියාගන්න" කැමරාව open කරලා තියන්න.</Text>
          </View>
        ) : (
          talks.map((t) => (
            <View key={t.id} style={s.card}>
              <View style={s.cardHead}>
                {t.photo_url ? <Image source={{ uri: t.photo_url }} style={s.face} /> : <View style={[s.face, { backgroundColor: '#E3F4F1' }]} />}
                <View style={{ flex: 1 }}>
                  <Text style={s.who}>
                    ඔයාගේ {t.relation_si}{t.name && t.name !== t.relation_si ? ` ${t.name}` : ''} {MOOD[t.mood || ''] || ''}
                  </Text>
                  <Text style={s.when}>
                    {timeAgo(t.time)}{t.seconds ? ` · විනාඩි ${Math.max(1, Math.round(t.seconds / 60))}ක්` : ''}
                  </Text>
                </View>
                <TouchableOpacity style={[s.listenBtn, playing === t.id && { backgroundColor: '#0F2A24' }]} onPress={() => listen(t)}>
                  <Ionicons name={playing === t.id ? 'stop' : 'volume-high'} size={20} color="#fff" />
                </TouchableOpacity>
              </View>
              <Text style={s.summary}>{t.summary_si}</Text>
              {t.visitor_asked?.map((x, i) => <Text key={`a${i}`} style={s.line}>❓ එයා ඇහුවා: {x.si}</Text>)}
              {t.patient_said?.map((x, i) => <Text key={`s${i}`} style={s.line}>🗣 ඔයා කිව්වා: {x.si}</Text>)}
              {(t.topics?.length > 0 || t.promises?.length > 0) && (
                <View style={s.chips}>
                  {t.topics?.map((tp, i) => <View key={`t${i}`} style={s.chip}><Text style={s.chipText}>💬 {tp.si}</Text></View>)}
                  {t.promises?.map((p, i) => (
                    <View key={`p${i}`} style={[s.chip, s.promise]}><Text style={[s.chipText, { color: '#8A5A12' }]}>📅 {p.si}</Text></View>
                  ))}
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7F5' },
  scroll: { padding: 20, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  backBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#E3EAE7' },
  title: { fontSize: 22, fontWeight: '900', color: '#0F2A24' },
  sub: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  howCard: { backgroundColor: '#fff', borderRadius: 24, padding: 18, borderWidth: 1, borderColor: '#E3EAE7' },
  howTitle: { fontSize: 17, fontWeight: '900', color: '#0F2A24', marginBottom: 14 },
  step: { flexDirection: 'row', gap: 12 },
  stepLeft: { alignItems: 'center', width: 38 },
  stepIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E3F4F1', alignItems: 'center', justifyContent: 'center' },
  stepLine: { flex: 1, width: 2, backgroundColor: '#CDE9E3', marginVertical: 2 },
  stepText: { fontSize: 15.5, fontWeight: '800', color: '#0F2A24', marginTop: 8 },
  stepSub: { fontSize: 13, color: '#64748B', marginTop: 2, lineHeight: 19 },
  consentLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 4,
    backgroundColor: '#E3F4F1', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  consentLinkText: { color: '#0F9D8A', fontWeight: '800', fontSize: 13 },
  section: { fontSize: 19, fontWeight: '900', color: '#0F2A24', marginTop: 24, marginBottom: 12 },
  empty: { alignItems: 'center', padding: 26, backgroundColor: '#fff', borderRadius: 24, borderWidth: 1, borderColor: '#E3EAE7', gap: 6 },
  emptyText: { fontSize: 17, fontWeight: '800', color: '#0F2A24' },
  emptySub: { fontSize: 13.5, color: '#64748B', textAlign: 'center', lineHeight: 20 },
  card: { backgroundColor: '#fff', borderRadius: 24, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E3EAE7',
    shadowColor: '#0F2A24', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  face: { width: 52, height: 52, borderRadius: 26 },
  who: { fontSize: 16.5, fontWeight: '900', color: '#0F2A24' },
  when: { fontSize: 12.5, color: '#64748B', fontWeight: '600', marginTop: 2 },
  listenBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#0F9D8A', alignItems: 'center', justifyContent: 'center' },
  summary: { fontSize: 17, lineHeight: 27, color: '#1E293B', marginTop: 12 },
  line: { fontSize: 14.5, color: '#475569', marginTop: 6, lineHeight: 21 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { backgroundColor: '#E3F4F1', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  promise: { backgroundColor: '#FBEFD9' },
  chipText: { fontSize: 13, fontWeight: '700', color: '#0F766E' },
});
