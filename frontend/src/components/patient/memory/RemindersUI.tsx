import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import axios from 'axios';
import { AI_URL, getPatientId, speak, stopSpeaking } from '../../../services/memoryAI';
import { ReminderArt } from './findThings/Illustrations';

type Routine = {
  id: string; label: string; label_si: string; activity_si: string; usual_si: string | null; days_seen: number;
  days: number; learned: boolean; done_today: boolean; done_at: string | null; grace: number;
  helped: number; reminded: number; flag: boolean;
};
type Visit = { id: string; date: string; who_si: string; promise_si: string; photo_url?: string; say_si: string };

const EMOJI: Record<string, string> = {
  'pill bottle': '💊', cup: '☕', toothbrush: '🪥', bottle: '🍶', 'drinking glass': '🥛', bowl: '🥣', spoon: '🥄',
  book: '📖', remote: '📺',
};

const dayLabel = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff === 0) return 'අද';
  if (diff === 1) return 'හෙට';
  return ['ඉරිදා', 'සඳුදා', 'අඟහරුවාදා', 'බදාදා', 'බ්‍රහස්පතින්දා', 'සිකුරාදා', 'සෙනසුරාදා'][d.getDay()];
};

export default function RemindersUI() {
  const router = useRouter();
  const [data, setData] = useState<{ routines: Routine[]; visits: Visit[] } | null>(null);

  useFocusEffect(useCallback(() => {
    (async () => {
      const pid = await getPatientId();
      try {
        const res = await axios.get(`${AI_URL}/reminders/${pid}`, { timeout: 10000 });
        setData(res.data);
      } catch {
        setData({ routines: [], visits: [] });
      }
    })();
    return () => stopSpeaking();
  }, []));

  const learned = data?.routines.filter((r) => r.learned) || [];
  const learning = data?.routines.filter((r) => !r.learned) || [];

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#0F2A24" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>මතක් කිරීම්</Text>
            <Text style={s.sub}>Reminders that learn your day</Text>
          </View>
          <ReminderArt size={58} />
        </View>

        <View style={s.explain}>
          <Ionicons name="sparkles" size={18} color="#0F9D8A" />
          <Text style={s.explainText}>
            කැමරාව ඔයා හැමදාම බෙහෙත් බොන, තේ බොන වෙලාවල් ඉගෙන ගන්නවා. ඒ වෙලාව පහු වෙලත් අද කළේ නැත්නම් විතරයි මතක් කරන්නේ - කළා නම් කරදර කරන්නේ නැහැ.
          </Text>
        </View>

        {!data ? <ActivityIndicator color="#0F9D8A" style={{ marginTop: 30 }} /> : (
          <>
            {data.visits.length > 0 && <Text style={s.section}>📅 එන්න ඉන්න අය</Text>}
            {data.visits.map((v) => (
              <TouchableOpacity key={v.id} style={s.visit} onPress={() => speak(v.say_si)} activeOpacity={0.85}>
                {v.photo_url ? <Image source={{ uri: v.photo_url }} style={s.face} /> : <Text style={{ fontSize: 30 }}>🙂</Text>}
                <View style={{ flex: 1 }}>
                  <Text style={s.visitDay}>{dayLabel(v.date)}</Text>
                  <Text style={s.visitWho}>{v.who_si} එනවා</Text>
                  <Text style={s.visitWhat} numberOfLines={2}>{v.promise_si}</Text>
                </View>
                <Ionicons name="volume-high" size={22} color="#0F9D8A" />
              </TouchableOpacity>
            ))}

            <Text style={s.section}>⏰ ඔයාගේ දවසේ පුරුදු</Text>
            {learned.length === 0 && (
              <Text style={s.empty}>තවම පුරුදු ඉගෙන ගත්තේ නැහැ. දවස් 3ක් විතර කැමරාව බෙහෙත් බෝතලය, කෝප්පය වගේ දේවල් දැක්කාම මෙතන පේනවා.</Text>
            )}
            {learned.map((r) => (
              <View key={r.id} style={[s.card, r.done_today && s.cardDone]}>
                <View style={s.icon}><Text style={{ fontSize: 30 }}>{EMOJI[r.label] || '⏰'}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>{r.activity_si.replace(/වේ$/, 'න')} වෙලාව</Text>
                  <Text style={s.cardSub}>සාමාන්‍යයෙන් {r.usual_si}ට · දවස් {r.days_seen}/{r.days} දැක්කා</Text>
                  {r.reminded > 0 && (
                    <Text style={s.cardSub}>මතක් කළාම කළා: {r.helped}/{r.reminded}{r.flag ? ' · ⚠️ caregiver ට දැනුම් දුන්නා' : ''}</Text>
                  )}
                </View>
                <View style={[s.state, r.done_today ? s.stateDone : s.statePending]}>
                  <Text style={[s.stateText, { color: r.done_today ? '#15803D' : '#B45309' }]}>
                    {r.done_today ? '✓ අද කළා' : 'තවම නැහැ'}
                  </Text>
                </View>
              </View>
            ))}

            {learning.length > 0 && <Text style={s.section}>🌱 ඉගෙන ගනිමින්</Text>}
            {learning.map((r) => (
              <View key={r.id} style={s.learning}>
                <Text style={{ fontSize: 22 }}>{EMOJI[r.label] || '⏰'}</Text>
                <Text style={s.learningText}>{r.label_si} - දවස් {r.days_seen}/3ක් දැක්කා</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7F5' },
  scroll: { padding: 20, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  backBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#E3EAE7' },
  title: { fontSize: 24, fontWeight: '900', color: '#0F2A24' },
  sub: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  explain: { flexDirection: 'row', gap: 10, backgroundColor: '#E3F4F1', borderRadius: 18, padding: 14 },
  explainText: { flex: 1, fontSize: 14, color: '#0F3D36', lineHeight: 21 },
  section: { fontSize: 18, fontWeight: '900', color: '#0F2A24', marginTop: 22, marginBottom: 10 },
  empty: { fontSize: 14, color: '#64748B', lineHeight: 21, backgroundColor: '#fff', borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: '#E3EAE7' },
  visit: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF8EB', borderRadius: 20, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#F6DFB0' },
  face: { width: 52, height: 52, borderRadius: 26 },
  visitDay: { fontSize: 12.5, fontWeight: '900', color: '#B45309' },
  visitWho: { fontSize: 16.5, fontWeight: '900', color: '#0F2A24' },
  visitWhat: { fontSize: 13.5, color: '#475569', marginTop: 2 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 20, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#E3EAE7' },
  cardDone: { borderColor: '#BBF7D0' },
  icon: { width: 56, height: 56, borderRadius: 18, backgroundColor: '#F1F5F4', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16.5, fontWeight: '900', color: '#0F2A24' },
  cardSub: { fontSize: 12.5, color: '#64748B', marginTop: 2 },
  state: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  stateDone: { backgroundColor: '#DCFCE7' },
  statePending: { backgroundColor: '#FEF3C7' },
  stateText: { fontSize: 12, fontWeight: '900' },
  learning: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  learningText: { fontSize: 14, color: '#475569', fontWeight: '600' },
});
