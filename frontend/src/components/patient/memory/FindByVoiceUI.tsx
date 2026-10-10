import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import MapView, { Marker, Polyline } from 'react-native-maps';
import axios from 'axios';
import { RecordingPresets, useAudioRecorder } from 'expo-audio';
import {
  AI_URL, SeenThing, bearingDegrees, distanceMetres, getPatientId, relativeDirection, speak,
  startListening, stopAndUnderstand, stopSpeaking, timeAgo,
} from '../../../services/memoryAI';
import { EmptyBoxArt, VoiceArt } from './findThings/Illustrations';

const LISTEN_SECONDS = 5;
const NEAR_METRES = 15; // below this, GPS can't tell rooms apart - guide by room/anchor instead

type Phase = 'idle' | 'listening' | 'thinking';
type Result = { found: true; item: SeenThing } | { found: false; say: string };

export default function FindByVoiceUI() {
  const router = useRouter();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [left, setLeft] = useState(0);
  const [heard, setHeard] = useState('');
  const [recent, setRecent] = useState<SeenThing[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const pid = await getPatientId();
        setPatientId(pid);
        if (!pid) return;
        try {
          const res = await axios.get(`${AI_URL}/last-seen/${pid}`, { timeout: 10000 });
          setRecent(res.data.items || []);
        } catch {}
      })();
      return () => stopSpeaking();
    }, []),
  );

  useEffect(() => {
    (async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return;
      const pos = await Location.getLastKnownPositionAsync();
      if (pos) setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
        .then((p) => setUserLoc({ lat: p.coords.latitude, lng: p.coords.longitude }))
        .catch(() => {});
    })();
  }, []);

  useEffect(() => {
    if (phase !== 'listening') {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.15, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, [phase, pulse]);

  const guidanceFor = (item: SeenThing, here: { lat: number; lng: number } | null, hdg: number | null) => {
    if (!item.lat || !item.lng || !here) return '';
    const dist = distanceMetres(here.lat, here.lng, item.lat, item.lng);
    if (dist < NEAR_METRES) {
      const near = item.anchors?.length ? ' එතන තිබුණු ලොකු දේවල් ළඟ බලන්න.' : '';
      return `ඔබ ඒ තැනට ගොඩක් ළඟයි.${item.room_si ? ` ${item.room_si}ේ බලන්න.` : ''}${near}`;
    }
    const dir = relativeDirection(bearingDegrees(here.lat, here.lng, item.lat, item.lng), hdg);
    return `ඒක මීටර් ${Math.round(dist)}ක් ${dir} තියෙන්නේ.`;
  };

  const findBy = async (params: { label?: string; q?: string }) => {
    if (!patientId) return;
    setPhase('thinking');
    try {
      const res = await axios.get(`${AI_URL}/find-thing/${patientId}`, { params, timeout: 20000 });
      const d = res.data;
      let hdg: number | null = null;
      try {
        const h = await Location.getHeadingAsync();
        hdg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
        setHeading(hdg);
      } catch {}
      setPhase('idle');
      if (d.found) {
        setResult({ found: true, item: d.item });
        await speak(d.item.say_si);
        const g = guidanceFor(d.item, userLoc, hdg);
        if (g) await speak(g);
      } else {
        setResult({ found: false, say: d.say_si });
        await speak(d.say_si);
      }
    } catch {
      setPhase('idle');
      speak('AI සේවාවට සම්බන්ධ වෙන්න බැහැ.');
    }
  };

  const listen = async () => {
    if (!patientId || phase !== 'idle') return;
    setHeard('');
    try {
      await speak('ඔබ හොයන්නේ මොකක්ද? කියන්න.');
      setPhase('listening');
      await startListening(recorder);
      for (let s = LISTEN_SECONDS; s > 0; s--) {
        setLeft(s);
        await new Promise((r) => setTimeout(r, 1000));
      }
      setPhase('thinking');
      const meaning = await stopAndUnderstand(recorder, patientId);
      setHeard(meaning.text);
      if (meaning.object) return findBy({ label: meaning.object });
      return findBy({ q: meaning.text });
    } catch {
      setPhase('idle');
      speak('සමාවෙන්න, ඇහුණේ නැහැ. පහළින් ඔබේ දේ තෝරන්නත් පුළුවන්.');
    }
  };

  const item = result?.found ? result.item : null;
  const hasMap = !!(item?.lat && item?.lng);
  const dist = item && hasMap && userLoc ? distanceMetres(userLoc.lat, userLoc.lng, item.lat!, item.lng!) : null;
  const camHeading = item && hasMap && userLoc ? bearingDegrees(userLoc.lat, userLoc.lng, item.lat!, item.lng!) : 0;

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#0f172a" />
          </TouchableOpacity>
          <View>
            <Text style={s.title}>හඬින් හොයන්න</Text>
            <Text style={s.sub}>Find by voice</Text>
          </View>
        </View>

        <View style={s.hero}>
          <VoiceArt size={110} />
          <Text style={s.heroText}>"මගේ කෝප්පය කොහෙද?"</Text>
          <Text style={s.heroSub}>Tap the button and ask in Sinhala</Text>

          <Animated.View style={{ transform: [{ scale: pulse }] }}>
            <TouchableOpacity style={[s.mic, phase === 'listening' && s.micOn]} onPress={listen} disabled={phase !== 'idle'} activeOpacity={0.8}>
              {phase === 'thinking' ? <ActivityIndicator size="large" color="#fff" />
                : <Ionicons name="mic" size={56} color="#fff" />}
            </TouchableOpacity>
          </Animated.View>
          <Text style={s.micLabel}>
            {phase === 'listening' ? `කතා කරන්න... ${left}` : phase === 'thinking' ? 'හොයනවා...' : 'කතා කරන්න ඔබන්න'}
          </Text>
          {!!heard && <Text style={s.heard}>ඇහුණේ: "{heard}"</Text>}
        </View>

        <Text style={s.section}>අන්තිමට දැක්ක දේවල් · tap to find</Text>
        {recent.length === 0 ? (
          <View style={s.empty}>
            <EmptyBoxArt size={110} />
            <Text style={s.emptyText}>තවම කිසිම දෙයක් මතක තියාගෙන නැහැ. "මතක තියාගන්න" එකෙන් ඔබේ දේවල් පෙන්වන්න.</Text>
          </View>
        ) : (
          <View style={s.grid}>
            {recent.map((it) => (
              <TouchableOpacity key={it.label} style={s.thing} onPress={() => findBy({ label: it.label })}>
                <Image source={{ uri: it.photo_url }} style={s.thingImg} />
                <Text style={s.thingName}>{it.label_si}</Text>
                <Text style={s.thingWhen}>{timeAgo(it.time)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={!!result} animationType="slide" onRequestClose={() => setResult(null)}>
        <View style={s.modal}>
          {item && hasMap ? (
            <MapView
              style={StyleSheet.absoluteFill}
              showsUserLocation
              showsBuildings
              showsCompass
              pitchEnabled
              initialCamera={{
                center: { latitude: item.lat!, longitude: item.lng! },
                pitch: 60,
                heading: camHeading,
                altitude: 220,
                zoom: 18,
              }}
            >
              <Marker coordinate={{ latitude: item.lat!, longitude: item.lng! }}>
                <View style={s.pin}>
                  <Image source={{ uri: item.photo_url }} style={s.pinImg} />
                  <Text style={s.pinText}>{item.label_si}</Text>
                </View>
              </Marker>
              {userLoc && (
                <Polyline
                  coordinates={[{ latitude: userLoc.lat, longitude: userLoc.lng }, { latitude: item.lat!, longitude: item.lng! }]}
                  strokeColor="#7c3aed" strokeWidth={5} lineDashPattern={[10, 8]}
                />
              )}
            </MapView>
          ) : item ? (
            <Image source={{ uri: item.photo_url }} style={StyleSheet.absoluteFill} blurRadius={8} />
          ) : (
            <View style={[StyleSheet.absoluteFill, s.notFoundBg]} />
          )}

          <SafeAreaView style={s.modalTop} edges={['top']}>
            <TouchableOpacity style={s.closeBtn} onPress={() => { stopSpeaking(); setResult(null); }}>
              <Ionicons name="close" size={26} color="#0f172a" />
            </TouchableOpacity>
          </SafeAreaView>

          <View style={s.card}>
            {item ? (
              <>
                <View style={s.cardRow}>
                  <Image source={{ uri: item.photo_url }} style={s.cardImg} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardName}>{item.label_si}</Text>
                    <Text style={s.cardMeta}>{item.when_si || timeAgo(item.time)}</Text>
                    {!!item.room_si && <Text style={s.cardMeta}>📍 {item.room_si}{item.anchors?.length ? ` · ${item.anchors.join(', ')}` : ''}</Text>}
                  </View>
                </View>
                {dist != null && (
                  <View style={s.distRow}>
                    <View style={s.distBadge}>
                      <Ionicons name="navigate" size={18} color="#fff" />
                      <Text style={s.distText}>{dist < NEAR_METRES ? 'ගොඩක් ළඟයි' : `මීටර් ${Math.round(dist)}`}</Text>
                    </View>
                    {dist >= NEAR_METRES && (
                      <Text style={s.dirText}>{relativeDirection(camHeading, heading)}</Text>
                    )}
                  </View>
                )}
                {!hasMap && <Text style={s.noGps}>මේ වෙලාවේ GPS තිබුණේ නැහැ - ඡායාරූපය සහ කාමරය බලන්න.</Text>}
                <View style={s.btnRow}>
                  {hasMap && (
                    <TouchableOpacity style={[s.btn, { backgroundColor: '#7c3aed' }]}
                      onPress={() => {
                        stopSpeaking();
                        setResult(null);
                        router.push({ pathname: '/patient/ar-navigate', params: { objectName: item.label_si, objLat: String(item.lat), objLng: String(item.lng) } } as any);
                      }}>
                      <Ionicons name="compass" size={20} color="#fff" />
                      <Text style={s.btnText}>AR මඟ පෙන්වීම</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[s.btn, { backgroundColor: '#0f172a' }]}
                    onPress={async () => { await speak(item.say_si || ''); const g = guidanceFor(item, userLoc, heading); if (g) speak(g); }}>
                    <Ionicons name="volume-high" size={20} color="#fff" />
                    <Text style={s.btnText}>ආයෙත් කියන්න</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <View style={{ alignItems: 'center', gap: 12 }}>
                <EmptyBoxArt size={110} />
                <Text style={s.notFoundText}>{result && !result.found ? result.say : ''}</Text>
                <TouchableOpacity style={[s.btn, { backgroundColor: '#2563eb', alignSelf: 'stretch' }]}
                  onPress={() => { setResult(null); router.push('/patient/remember-live' as any); }}>
                  <Ionicons name="camera" size={20} color="#fff" />
                  <Text style={s.btnText}>කැමරාවට පෙන්වන්න</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { padding: 20, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  backBtn: { width: 46, height: 46, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  title: { fontSize: 26, fontWeight: '900', color: '#0f172a' },
  sub: { fontSize: 13, color: '#64748b', fontWeight: '700' },

  hero: { backgroundColor: '#f5f3ff', borderRadius: 28, padding: 22, alignItems: 'center', gap: 8, marginBottom: 24 },
  heroText: { fontSize: 22, fontWeight: '900', color: '#5b21b6' },
  heroSub: { fontSize: 13, color: '#7c3aed', fontWeight: '600', marginBottom: 10 },
  mic: { width: 130, height: 130, borderRadius: 65, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center', shadowColor: '#7c3aed', shadowOpacity: 0.4, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  micOn: { backgroundColor: '#e11d48' },
  micLabel: { fontSize: 18, fontWeight: '900', color: '#334155', marginTop: 8 },
  heard: { fontSize: 15, color: '#475569', fontStyle: 'italic' },

  section: { fontSize: 16, fontWeight: '900', color: '#334155', marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  thing: { width: '47%', backgroundColor: '#fff', borderRadius: 20, padding: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  thingImg: { width: '100%', height: 110, borderRadius: 14, backgroundColor: '#e2e8f0' },
  thingName: { fontSize: 18, fontWeight: '900', color: '#0f172a', marginTop: 8 },
  thingWhen: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  empty: { alignItems: 'center', gap: 10, padding: 18, backgroundColor: '#fff', borderRadius: 20 },
  emptyText: { textAlign: 'center', color: '#64748b', fontSize: 14, lineHeight: 21 },

  modal: { flex: 1, backgroundColor: '#0f172a' },
  notFoundBg: { backgroundColor: '#fef3c7' },
  modalTop: { position: 'absolute', top: 0, right: 0, padding: 16 },
  closeBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', margin: 8, elevation: 4 },
  pin: { alignItems: 'center' },
  pinImg: { width: 64, height: 64, borderRadius: 16, borderWidth: 4, borderColor: '#fff', backgroundColor: '#e2e8f0' },
  pinText: { backgroundColor: '#7c3aed', color: '#fff', fontWeight: '900', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginTop: 4, overflow: 'hidden' },

  card: { position: 'absolute', left: 14, right: 14, bottom: 30, backgroundColor: '#fff', borderRadius: 28, padding: 18, gap: 12, elevation: 10, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16 },
  cardRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  cardImg: { width: 92, height: 92, borderRadius: 18, backgroundColor: '#e2e8f0' },
  cardName: { fontSize: 26, fontWeight: '900', color: '#0f172a' },
  cardMeta: { fontSize: 14, color: '#475569', fontWeight: '600', marginTop: 2 },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  distBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#16a34a', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  distText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  dirText: { fontSize: 17, fontWeight: '900', color: '#334155' },
  noGps: { color: '#92400e', fontWeight: '600' },
  btnRow: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 16, paddingVertical: 15 },
  btnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  notFoundText: { fontSize: 18, fontWeight: '800', color: '#0f172a', textAlign: 'center', lineHeight: 26 },
});
