import React, { useCallback, useRef, useState } from 'react';
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import axios from 'axios';
import { AI_URL, SeenThing, getPatientId, speak, stopSpeaking, timeAgo } from '../../../services/memoryAI';
import { EmptyBoxArt } from './findThings/Illustrations';

export default function ThingsMapUI() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const [items, setItems] = useState<SeenThing[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const pid = await getPatientId();
        if (pid) {
          try {
            const res = await axios.get(`${AI_URL}/last-seen/${pid}`, { timeout: 10000 });
            setItems(res.data.items || []);
          } catch {}
        }
        setLoaded(true);
        const { granted } = await Location.requestForegroundPermissionsAsync();
        if (granted) {
          const p = await Location.getLastKnownPositionAsync();
          if (p) setHere({ lat: p.coords.latitude, lng: p.coords.longitude });
        }
      })();
      return () => stopSpeaking();
    }, []),
  );

  const located = items.filter((i) => i.lat && i.lng);
  const center = located[0] ? { lat: located[0].lat!, lng: located[0].lng! } : here;

  const focus = (it: SeenThing) => {
    setSelected(it.label);
    if (it.lat && it.lng) {
      mapRef.current?.animateCamera({ center: { latitude: it.lat, longitude: it.lng }, pitch: 55, zoom: 19 }, { duration: 700 });
    }
    speak(`${it.label_si}. ${it.when_si || ''}${it.room_si ? `, ${it.room_si}ේ` : ''}.`);
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0f172a" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>දේවල් සිතියම</Text>
          <Text style={s.sub}>Object map · {items.length} things</Text>
        </View>
      </View>

      <View style={s.mapBox}>
        {center ? (
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            showsUserLocation
            showsBuildings
            pitchEnabled
            initialCamera={{ center: { latitude: center.lat, longitude: center.lng }, pitch: 45, heading: 0, altitude: 400, zoom: 17 }}
          >
            {located.map((it) => (
              <Marker key={it.label} coordinate={{ latitude: it.lat!, longitude: it.lng! }} onPress={() => focus(it)}>
                <View style={[s.pin, selected === it.label && s.pinOn]}>
                  <Image source={{ uri: it.photo_url }} style={s.pinImg} />
                </View>
              </Marker>
            ))}
          </MapView>
        ) : (
          <View style={[StyleSheet.absoluteFill, s.center]}>
            <Ionicons name="map-outline" size={48} color="#94a3b8" />
            <Text style={s.mapWait}>{loaded ? 'GPS ස්ථාන තවම නැහැ' : 'Loading...'}</Text>
          </View>
        )}
      </View>

      {loaded && items.length === 0 ? (
        <View style={s.empty}>
          <EmptyBoxArt size={120} />
          <Text style={s.emptyText}>තවම දේවල් මතක තියාගෙන නැහැ.</Text>
          <TouchableOpacity style={s.cta} onPress={() => router.push('/patient/remember-live' as any)}>
            <Ionicons name="camera" size={20} color="#fff" />
            <Text style={s.ctaText}>මතක තියාගන්න</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.label}
          contentContainerStyle={s.list}
          renderItem={({ item: it }) => (
            <TouchableOpacity style={[s.row, selected === it.label && s.rowOn]} onPress={() => focus(it)}>
              <Image source={{ uri: it.photo_url }} style={s.rowImg} />
              <View style={{ flex: 1 }}>
                <Text style={s.rowName}>{it.familiar ? `ඔබේ ${it.label_si}` : it.label_si}</Text>
                {it.familiar && <Text style={s.usual}>⭐ සුපුරුදු දෙයක් · seen {it.times_seen}x</Text>}
                <Text style={s.rowMeta}>{timeAgo(it.time)}{it.room_si ? ` · ${it.room_si}` : ''}</Text>
                {!it.lat && <Text style={s.noGps}>GPS නැහැ - කාමරය බලන්න</Text>}
              </View>
              {it.lat && it.lng ? (
                <TouchableOpacity style={s.navBtn}
                  onPress={() => router.push({ pathname: '/patient/ar-navigate', params: { objectName: it.label_si, objLat: String(it.lat), objLng: String(it.lng) } } as any)}>
                  <Ionicons name="navigate" size={20} color="#fff" />
                </TouchableOpacity>
              ) : null}
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 12 },
  backBtn: { width: 46, height: 46, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  title: { fontSize: 26, fontWeight: '900', color: '#0f172a' },
  sub: { fontSize: 13, color: '#64748b', fontWeight: '700' },
  mapBox: { height: 300, marginHorizontal: 16, borderRadius: 26, overflow: 'hidden', backgroundColor: '#e2e8f0' },
  mapWait: { color: '#64748b', fontWeight: '700', marginTop: 8 },
  pin: { borderRadius: 16, borderWidth: 3, borderColor: '#fff', backgroundColor: '#fff', elevation: 4 },
  pinOn: { borderColor: '#16a34a', transform: [{ scale: 1.2 }] },
  pinImg: { width: 50, height: 50, borderRadius: 13 },
  list: { padding: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 20, padding: 10, borderWidth: 2, borderColor: 'transparent' },
  rowOn: { borderColor: '#16a34a' },
  rowImg: { width: 66, height: 66, borderRadius: 14, backgroundColor: '#e2e8f0' },
  rowName: { fontSize: 20, fontWeight: '900', color: '#0f172a' },
  rowMeta: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  noGps: { fontSize: 12, color: '#b45309', fontWeight: '700' },
  usual: { fontSize: 12, color: '#7c3aed', fontWeight: '800' },
  navBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 12, padding: 24 },
  emptyText: { fontSize: 17, fontWeight: '800', color: '#475569' },
  cta: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 16, paddingHorizontal: 22, paddingVertical: 14 },
  ctaText: { color: '#fff', fontWeight: '900', fontSize: 16 },
});
