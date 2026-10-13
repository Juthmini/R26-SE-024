import React, { useCallback, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import axios from 'axios';
import { AI_URL, Person, getPatientId, speak, stopSpeaking, timeAgo } from '../../../services/memoryAI';
import { PeopleArt } from './findThings/Illustrations';

export default function PeopleMetUI() {
  const router = useRouter();
  const [people, setPeople] = useState<Person[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pid, setPid] = useState<string | null>(null);

  const load = useCallback(async () => {
    const id = await getPatientId();
    setPid(id);
    if (!id) return setLoaded(true);
    try {
      const res = await axios.get(`${AI_URL}/people/${id}`, { timeout: 10000 });
      setPeople(res.data.people || []);
    } catch {}
    setLoaded(true);
  }, []);

  useFocusEffect(useCallback(() => { load(); return () => stopSpeaking(); }, [load]));

  // Removing someone is a caregiver action now (PIN-protected Family screen).
  const remove = () => {
    Alert.alert('පවුලේ අය', 'කෙනෙක් ඉවත් කරන්න caregiver PIN එකෙන් "පවුලේ අය ලියාපදිංචිය" එකට යන්න.', [
      { text: 'හරි', style: 'cancel' },
      { text: 'යන්න', onPress: () => router.push('/patient/family' as any) },
    ]);
  };

  const intro = (p: Person) => {
    const who = p.name && p.name !== p.relation_si ? ` ${p.name}` : '';
    speak(`මේ ඔබේ ${p.relation_si}${who}. අන්තිමට හමුවුණේ ${timeAgo(p.last_seen || '')}.`);
  };

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#0f172a" />
          </TouchableOpacity>
          <View>
            <Text style={s.title}>මට හමුවූ අය</Text>
            <Text style={s.sub}>People I met</Text>
          </View>
        </View>

        {loaded && people.length === 0 ? (
          <View style={s.empty}>
            <PeopleArt size={130} />
            <Text style={s.emptyTitle}>තවම කිසිවෙක් නැහැ</Text>
            <Text style={s.emptyText}>"මතක තියාගන්න" කැමරාවට කෙනෙක් පෙනුණාම, මම "මේ කවුද?" කියලා අහනවා. ඔබ "මේ මගේ පුතා" වගේ කිව්වම මම මතක තියාගන්නවා.</Text>
          </View>
        ) : (
          <View style={s.grid}>
            {people.map((p) => (
              <TouchableOpacity key={p.id} style={s.card} onPress={() => intro(p)} onLongPress={remove}>
                {p.photo_url ? <Image source={{ uri: p.photo_url }} style={s.photo} /> : <View style={[s.photo, s.noPhoto]}><Ionicons name="person" size={44} color="#fdba74" /></View>}
                <Text style={s.relation}>{p.relation_si}</Text>
                {p.name && p.name !== p.relation_si ? <Text style={s.name}>{p.name}</Text> : null}
                <Text style={s.meta}>{timeAgo(p.last_seen || '')}{p.times_met ? ` · ${p.times_met}x` : ''}</Text>
                {!!p.face_samples && (
                  <Text style={s.learned}>🧠 මුහුණු {p.face_samples}ක් ඉගෙනගෙන</Text>
                )}
                {p.status === 'pending' && <Text style={s.pending}>⏳ Caregiver තහවුරු කරලා නැහැ</Text>}
                <View style={s.speakBadge}><Ionicons name="volume-high" size={16} color="#fff" /></View>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {people.length > 0 && <Text style={s.tip}>Tap to hear who it is · long-press to remove</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fffbf5' },
  scroll: { padding: 20, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  backBtn: { width: 46, height: 46, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#fed7aa' },
  title: { fontSize: 26, fontWeight: '900', color: '#0f172a' },
  sub: { fontSize: 13, color: '#9a3412', fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: { width: '47%', backgroundColor: '#fff', borderRadius: 24, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#fed7aa' },
  photo: { width: '100%', aspectRatio: 1, borderRadius: 18, backgroundColor: '#ffedd5' },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  relation: { fontSize: 22, fontWeight: '900', color: '#c2410c', marginTop: 10 },
  name: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  meta: { fontSize: 12, color: '#78716c', fontWeight: '600', marginTop: 2 },
  learned: { fontSize: 12, color: '#7c3aed', fontWeight: '800', marginTop: 4 },
  pending: { fontSize: 11, color: '#b45309', fontWeight: '800', marginTop: 4, textAlign: 'center' },
  speakBadge: { position: 'absolute', top: 18, right: 18, backgroundColor: 'rgba(234,88,12,0.9)', borderRadius: 12, padding: 6 },
  tip: { textAlign: 'center', color: '#a8a29e', marginTop: 18, fontWeight: '600' },
  empty: { alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 26, padding: 24 },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: '#0f172a' },
  emptyText: { textAlign: 'center', color: '#78716c', fontSize: 15, lineHeight: 23 },
});
