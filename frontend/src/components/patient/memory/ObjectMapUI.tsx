import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions,
  ActivityIndicator, ScrollView, Image, Modal, Animated
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MapView, { Marker, Callout, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import axios from 'axios';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.80:5000';
const { width, height } = Dimensions.get('window');

const OBJECT_COLORS: Record<string, string> = {
  cup: '#3b82f6', bottle: '#06b6d4', keys: '#f59e0b', phone: '#8b5cf6',
  glasses: '#10b981', medicine: '#ef4444', remote: '#f97316', book: '#6366f1',
  default: '#64748b',
};

const OBJECT_ICONS: Record<string, string> = {
  cup: '☕', bottle: '🍶', keys: '🔑', phone: '📱',
  glasses: '👓', medicine: '💊', remote: '📺', book: '📖',
};

interface SavedObject {
  _id?: string;
  objectName: string;
  roomLabel: string;
  locationDetail?: string;
  coordinates?: { lat?: number; lng?: number };
  confidence: number;
  detectedBy?: string;
  detectedAt?: string;
}

export default function ObjectMapUI() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const [objects, setObjects] = useState<SavedObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<any>(null);
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedObj, setSelectedObj] = useState<SavedObject | null>(null);
  const [showList, setShowList] = useState(false);
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const slideAnim = useRef(new Animated.Value(height)).current;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load patient
      const stored = await AsyncStorage.getItem('patient');
      if (stored) {
        const p = JSON.parse(stored);
        setPatient(p);

        // Load objects from backend
        try {
          const res = await axios.get(`${BASE_URL}/api/life-logging/objects/patient/${p.id}`, { timeout: 8000 });
          if (res.data.success) {
            setObjects(res.data.data);
          }
        } catch {
          // Fallback to AsyncStorage if offline
          const memKey = `patient_memories_${p.id}`;
          const stored = await AsyncStorage.getItem(memKey);
          if (stored) setObjects(JSON.parse(stored));
        }

        // Get current GPS
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            setCurrentPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          }
        } catch {}
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const showObjectDetail = (obj: SavedObject) => {
    setSelectedObj(obj);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }).start();
  };

  const hideDetail = () => {
    Animated.timing(slideAnim, { toValue: height, duration: 300, useNativeDriver: true }).start(() => setSelectedObj(null));
  };

  const speakObject = (obj: SavedObject) => {
    Speech.speak(`Your ${obj.objectName} is in the ${obj.roomLabel}.`, { language: 'en-US', rate: 0.85 });
  };

  const fitAllMarkers = () => {
    const withGPS = objects.filter(o => o.coordinates?.lat && o.coordinates?.lng);
    if (withGPS.length === 0) return;
    mapRef.current?.fitToCoordinates(
      withGPS.map(o => ({ latitude: o.coordinates!.lat!, longitude: o.coordinates!.lng! })),
      { edgePadding: { top: 80, right: 60, bottom: 200, left: 60 }, animated: true }
    );
  };

  const getTimeSince = (dateStr?: string) => {
    if (!dateStr) return 'Unknown';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hr ago`;
    return `${Math.floor(hrs / 24)} day ago`;
  };

  const defaultRegion = currentPos
    ? { latitude: currentPos.lat, longitude: currentPos.lng, latitudeDelta: 0.005, longitudeDelta: 0.005 }
    : { latitude: 6.9271, longitude: 79.8612, latitudeDelta: 0.01, longitudeDelta: 0.01 };

  const objectsWithGPS = objects.filter(o => o.coordinates?.lat && o.coordinates?.lng);

  if (loading) {
    return (
      <View style={styles.loadCenter}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadText}>Loading your object map...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* MAP */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={defaultRegion}
        showsUserLocation
        showsMyLocationButton={false}
        mapType="standard"
      >
        {/* Object Markers */}
        {objectsWithGPS.map((obj, idx) => (
          <Marker
            key={obj._id || idx}
            coordinate={{ latitude: obj.coordinates!.lat!, longitude: obj.coordinates!.lng! }}
            onPress={() => showObjectDetail(obj)}
          >
            {/* Custom Marker */}
            <View style={[styles.markerBubble, { backgroundColor: OBJECT_COLORS[obj.objectName || obj.name] || OBJECT_COLORS.default }]}>
              <Text style={styles.markerEmoji}>{OBJECT_ICONS[obj.objectName || obj.name] || '📦'}</Text>
            </View>
            <View style={styles.markerTail} />
          </Marker>
        ))}
      </MapView>

      {/* Top Bar */}
      <SafeAreaView style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <View style={styles.topCenter}>
          <Text style={styles.topTitle}>Object Map</Text>
          <Text style={styles.topSub}>{objects.length} objects tracked</Text>
        </View>
        <TouchableOpacity style={styles.fitBtn} onPress={fitAllMarkers}>
          <Ionicons name="expand" size={22} color="#3b82f6" />
        </TouchableOpacity>
      </SafeAreaView>

      {/* View Toggle */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'map' && styles.toggleActive]}
          onPress={() => setViewMode('map')}
        >
          <Ionicons name="map" size={16} color={viewMode === 'map' ? '#fff' : '#64748b'} />
          <Text style={[styles.toggleText, viewMode === 'map' && { color: '#fff' }]}>Map</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'list' && styles.toggleActive]}
          onPress={() => setViewMode('list')}
        >
          <Ionicons name="list" size={16} color={viewMode === 'list' ? '#fff' : '#64748b'} />
          <Text style={[styles.toggleText, viewMode === 'list' && { color: '#fff' }]}>List</Text>
        </TouchableOpacity>
      </View>

      {/* List View Overlay */}
      {viewMode === 'list' && (
        <View style={styles.listOverlay}>
          <Text style={styles.listTitle}>All Tracked Objects</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {objects.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="cube-outline" size={48} color="#cbd5e1" />
                <Text style={styles.emptyText}>No objects tracked yet</Text>
                <Text style={styles.emptySub}>Use AR Vision to scan objects</Text>
              </View>
            ) : objects.map((obj, idx) => (
              <TouchableOpacity key={obj._id || idx} style={styles.listItem} onPress={() => {
                setViewMode('map');
                if (obj.coordinates?.lat && obj.coordinates?.lng) {
                  mapRef.current?.animateToRegion({
                    latitude: obj.coordinates.lat,
                    longitude: obj.coordinates.lng,
                    latitudeDelta: 0.002,
                    longitudeDelta: 0.002,
                  });
                  setTimeout(() => showObjectDetail(obj), 600);
                }
              }}>
                <View style={[styles.listIconBox, { backgroundColor: (OBJECT_COLORS[obj.objectName || obj.name] || OBJECT_COLORS.default) + '22' }]}>
                  <Text style={styles.listEmoji}>{OBJECT_ICONS[obj.objectName || obj.name] || '📦'}</Text>
                </View>
                <View style={styles.listInfo}>
                  <Text style={styles.listObjName}>
                    {(obj.objectName || obj.name) ? (obj.objectName || obj.name).charAt(0).toUpperCase() + (obj.objectName || obj.name).slice(1) : 'Unknown Object'}
                  </Text>
                  <Text style={styles.listRoom}>📍 {obj.roomLabel || 'Auto-saved'}</Text>
                  <Text style={styles.listTime}>🕐 {getTimeSince(obj.detectedAt)}</Text>
                </View>
                <View style={[styles.confBadge, { backgroundColor: (obj.confidence || 0) > 70 ? '#dcfce7' : '#fef3c7' }]}>
                  <Text style={[styles.confText, { color: (obj.confidence || 0) > 70 ? '#16a34a' : '#b45309' }]}>{obj.confidence ? `${obj.confidence}%` : 'Saved'}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Bottom Detail Sheet */}
      {selectedObj && (
        <Animated.View style={[styles.detailSheet, { transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.detailHeader}>
            {selectedObj.image_url ? (
               <Image source={{ uri: selectedObj.image_url }} style={styles.detailImage} />
            ) : (
               <View style={[styles.detailIconBox, { backgroundColor: (OBJECT_COLORS[selectedObj.objectName || selectedObj.name] || OBJECT_COLORS.default) + '22' }]}>
                 <Text style={styles.detailEmoji}>{OBJECT_ICONS[selectedObj.objectName || selectedObj.name] || '📦'}</Text>
               </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.detailName}>
                {(selectedObj?.objectName || selectedObj?.name) ? (selectedObj.objectName || selectedObj.name).charAt(0).toUpperCase() + (selectedObj.objectName || selectedObj.name).slice(1) : 'Unknown Object'}
              </Text>
              <Text style={styles.detailRoom}>📍 {selectedObj.roomLabel || 'Auto-saved memory'}</Text>
            </View>
            <TouchableOpacity onPress={hideDetail}>
              <Ionicons name="close-circle" size={30} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {selectedObj.conflict && (
            <View style={styles.conflictBanner}>
              <Ionicons name="warning" size={16} color="#dc2626" />
              <Text style={styles.conflictText}>{selectedObj.conflict}</Text>
            </View>
          )}

          <View style={styles.detailMeta}>
            <View style={styles.metaChip}>
              <Ionicons name="time-outline" size={14} color="#64748b" />
              <Text style={styles.metaText}>{getTimeSince(selectedObj.detectedAt)}</Text>
            </View>
            <View style={styles.metaChip}>
              <Ionicons name="checkmark-circle-outline" size={14} color="#64748b" />
              <Text style={styles.metaText}>{selectedObj.confidence ? `${selectedObj.confidence}% confident` : 'Manual save'}</Text>
            </View>
            <View style={styles.metaChip}>
              <Ionicons name="camera-outline" size={14} color="#64748b" />
              <Text style={styles.metaText}>{selectedObj.detectedBy || 'camera'}</Text>
            </View>
          </View>

          {selectedObj.locationDetail ? (
            <Text style={styles.locDetail}>📝 {selectedObj.locationDetail}</Text>
          ) : null}

          <View style={styles.detailActions}>
            <TouchableOpacity style={styles.speakBtn} onPress={() => speakObject(selectedObj)}>
              <Ionicons name="volume-high" size={20} color="#fff" />
              <Text style={styles.speakBtnText}>Speak Location</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.refreshBtn} onPress={loadData}>
              <Ionicons name="refresh" size={20} color="#3b82f6" />
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* No GPS Warning */}
      {objectsWithGPS.length === 0 && viewMode === 'map' && (
        <View style={styles.noGpsBanner}>
          <Ionicons name="information-circle" size={16} color="#0ea5e9" />
          <Text style={styles.noGpsText}>Objects saved without GPS — switch to List view to see all</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  map: { ...StyleSheet.absoluteFillObject },
  loadCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#f8fafc' },
  loadText: { color: '#64748b', fontSize: 14, fontWeight: '600' },

  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 12,
  },
  backBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', elevation: 4, shadowOpacity: 0.1, shadowRadius: 8 },
  topCenter: { flex: 1 },
  topTitle: { fontSize: 18, fontWeight: '900', color: '#0f172a' },
  topSub: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  fitBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', elevation: 4, shadowOpacity: 0.1, shadowRadius: 8 },

  toggleRow: {
    position: 'absolute', top: 100, alignSelf: 'center', zIndex: 20,
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 20, padding: 4, gap: 4,
    elevation: 6, shadowOpacity: 0.12, shadowRadius: 10,
  },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16 },
  toggleActive: { backgroundColor: '#3b82f6' },
  toggleText: { fontSize: 13, fontWeight: '800', color: '#64748b' },

  // Object Markers
  markerBubble: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff', elevation: 6 },
  markerEmoji: { fontSize: 20 },
  markerTail: { width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 10, borderStyle: 'solid', backgroundColor: 'transparent', borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#fff', alignSelf: 'center', marginTop: -1 },

  // List view
  listOverlay: {
    position: 'absolute', top: 140, left: 0, right: 0, bottom: 0, zIndex: 15,
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 20,
    elevation: 12,
  },
  listTitle: { fontSize: 18, fontWeight: '900', color: '#0f172a', marginBottom: 16 },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#f8fafc', borderRadius: 20, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  listIconBox: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  listEmoji: { fontSize: 24 },
  listInfo: { flex: 1, gap: 2 },
  listObjName: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  listRoom: { fontSize: 13, fontWeight: '600', color: '#475569' },
  listTime: { fontSize: 12, fontWeight: '500', color: '#94a3b8' },
  confBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  confText: { fontSize: 12, fontWeight: '900' },

  emptyBox: { alignItems: 'center', padding: 40, gap: 10 },
  emptyText: { fontSize: 18, fontWeight: '800', color: '#475569' },
  emptySub: { fontSize: 14, color: '#94a3b8', textAlign: 'center' },

  // Detail Sheet
  detailSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30,
    backgroundColor: '#fff', borderTopLeftRadius: 32, borderTopRightRadius: 32,
    padding: 24, paddingBottom: 40,
    elevation: 20, shadowOpacity: 0.2, shadowRadius: 20,
  },
  sheetHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#e2e8f0', alignSelf: 'center', marginBottom: 20 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  detailIconBox: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  detailImage: { width: 64, height: 64, borderRadius: 20 },
  detailEmoji: { fontSize: 30 },
  detailName: { fontSize: 24, fontWeight: '900', color: '#0f172a' },
  detailRoom: { fontSize: 15, fontWeight: '700', color: '#475569', marginTop: 2 },
  conflictBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef2f2', padding: 12, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#fca5a5' },
  conflictText: { flex: 1, color: '#b91c1c', fontSize: 13, fontWeight: '700' },
  detailMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f1f5f9', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  metaText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  locDetail: { fontSize: 14, color: '#475569', fontWeight: '600', marginBottom: 16, backgroundColor: '#f8fafc', borderRadius: 12, padding: 12 },
  detailActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  speakBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#3b82f6', borderRadius: 18, paddingVertical: 16 },
  speakBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  refreshBtn: { width: 56, height: 56, borderRadius: 18, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },

  noGpsBanner: {
    position: 'absolute', bottom: 24, left: 20, right: 20, zIndex: 15,
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#e0f2fe',
    borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#7dd3fc',
  },
  noGpsText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#0369a1' },
});
