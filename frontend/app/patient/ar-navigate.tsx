import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions,
  Animated, StatusBar, Platform
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { speak as speakSinhala } from "../../src/services/memoryAI";
import { SafeAreaView } from "react-native-safe-area-context";

const { width: W, height: H } = Dimensions.get("window");
const WALK_MPS = 1.4;

function haversineMetres(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";

// Bilingual voice phrases - every Speech.speak() call in this screen goes
// through speak(key, ...args) below instead of hardcoded English, so the
// English/Sinhala toggle actually covers all navigation guidance, not just
// some of it.
const PHRASES = {
  en: {
    start: (obj: string) => `Starting Navigation to your ${obj}.`,
    veryClose: (obj: string) => `You are very close! Look around for your ${obj}.`,
    distanceUpdate: (dm: number, obj: string) => `${dm} metres to your ${obj}.`,
    foundHere: (obj: string) => `Here! This is your ${obj}!`,
    locating: () => `Locating your object...`,
    rightHere: (obj: string) => `Your ${obj} is right here! Look around.`,
    fullDirection: (obj: string, distance: number, eta: string) =>
      `Your ${obj} is ${distance} metres away. Estimated ${eta} walking. Follow the yellow arrows.`,
  },
  si: {
    start: (obj: string) => `ඔයාගේ ${obj} වෙත යන්න පටන් ගමු.`,
    veryClose: (obj: string) => `ඔයා ගොඩක් ළඟයි! ${obj} වටේට හොයන්න.`,
    distanceUpdate: (dm: number, obj: string) => `${obj} වෙත තව මීටර් ${dm}යි.`,
    foundHere: (obj: string) => `මෙන්න! මේක තමයි ඔයාගේ ${obj}!`,
    locating: () => `ඔයාගේ object එක හොයමින්...`,
    rightHere: (obj: string) => `ඔයාගේ ${obj} මෙන්න මෙතන! වටේට බලන්න.`,
    fullDirection: (obj: string, distance: number, eta: string) =>
      `ඔයාගේ ${obj} මීටර් ${distance}ක් දුරින් තියෙනවා. ඇවිදගෙන විනාඩි ${eta} විතර යනවා. කහ arrow ටික follow කරන්න.`,
  },
};

export default function ARNavigateScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();

  const objectName = params.objectName || "Object";
  const parsedLat = params.objLat ? parseFloat(params.objLat) : null;
  const parsedLng = params.objLng ? parseFloat(params.objLng) : null;
  
  const [permission, requestPermission] = useCameraPermissions();
  const [userLoc, setUserLoc] = useState(null);
  const [targetLat, setTargetLat] = useState(parsedLat);
  const [targetLng, setTargetLng] = useState(parsedLng);
  
  const hasGPS = targetLat !== null && targetLng !== null && !isNaN(targetLat) && !isNaN(targetLng);
  
  const [heading, setHeading] = useState(0);
  const [distance, setDistance] = useState(null);
  const [reached, setReached] = useState(false);
  const [viewMode, setViewMode] = useState<'ar' | 'map'>('ar');
  const [lang, setLang] = useState<'en' | 'si'>('si');
  const langRef = useRef<'en' | 'si'>('si');
  useEffect(() => { langRef.current = lang; }, [lang]);

  // Reads from langRef (not `lang` directly) so callbacks registered once on
  // mount (location/heading watchers) still speak in whichever language is
  // currently selected, not whatever was selected when they were set up.
  const speak = useCallback((key: keyof typeof PHRASES['en'], ...args: any[]) => {
    const activeLang = langRef.current;
    // @ts-ignore - args shape matches each phrase fn's own params
    const text = PHRASES[activeLang][key](...args);
    // iOS has no Sinhala system voice, so Sinhala goes through the AI server's TTS.
    if (activeLang === 'si') speakSinhala(text, 'si');
    else Speech.speak(text, { rate: 0.9, language: 'en-US' });
  }, []);

  const arrowAnim = useRef(new Animated.Value(0)).current;
  const reachAnim = useRef(new Animated.Value(0)).current;
  const locSubRef = useRef(null);
  const headSubRef = useRef(null);
  const spokenRef = useRef(new Set());

  const getBearing = useCallback(() => {
    if (!userLoc || !hasGPS) return 0;
    const dLon = ((targetLng - userLoc.longitude) * Math.PI) / 180;
    const lat1 = (userLoc.latitude * Math.PI) / 180;
    const lat2 = (targetLat * Math.PI) / 180;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }, [userLoc, hasGPS, targetLat, targetLng]);

  const arrowRotation = ((getBearing() - heading + 360) % 360).toFixed(1);
  const etaSeconds = distance ? Math.round(distance / WALK_MPS) : null;
  const etaLabel = etaSeconds ? (etaSeconds < 60 ? `${etaSeconds}s` : `${Math.ceil(etaSeconds / 60)}min`) : "--";

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(arrowAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(arrowAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const cameraRef = useRef<CameraView>(null);
  const [isLookingAtObject, setIsLookingAtObject] = useState(false);
  const scanIntervalRef = useRef(null);
  const isScanningRef = useRef(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || !active) return;

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      let tLat = targetLat;
      let tLng = targetLng;
      
      if (active) {
        setUserLoc(loc.coords);
        if (parsedLat === null || isNaN(parsedLat) || parsedLng === null || isNaN(parsedLng)) {
          // If no GPS provided (e.g. from ESP32 cam), assume it's in the same house (~4m away)
          tLat = loc.coords.latitude + 0.00003;
          tLng = loc.coords.longitude + 0.00003;
          setTargetLat(tLat);
          setTargetLng(tLng);
        }
      }
      
      if (active && tLat !== null && tLng !== null) {
        let d = haversineMetres(loc.coords.latitude, loc.coords.longitude, tLat, tLng);
        
        // Safety fix for old records with fake Colombo coordinates (e.g. 11.9km away)
        if (d > 1000) {
          tLat = loc.coords.latitude + 0.00003;
          tLng = loc.coords.longitude + 0.00003;
          setTargetLat(tLat);
          setTargetLng(tLng);
          d = haversineMetres(loc.coords.latitude, loc.coords.longitude, tLat, tLng);
        }
        
        setDistance(Math.round(d));
      }

      locSubRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 1 },
        (l) => {
          if (!active) return;
          setUserLoc(l.coords);
          if (tLat !== null && tLng !== null) {
            const d = haversineMetres(l.coords.latitude, l.coords.longitude, tLat, tLng);
            const dm = Math.round(d);
            setDistance(dm);
            [50, 20, 10, 5, 3].forEach((m) => {
              if (dm <= m && !spokenRef.current.has(m)) {
                spokenRef.current.add(m);
                if (m <= 3) {
                  speak('veryClose', objectName);
                  setReached(true);
                  Animated.spring(reachAnim, { toValue: 1, useNativeDriver: true }).start();
                } else {
                  speak('distanceUpdate', dm, objectName);
                }
              }
            });
          }
        }
      );

      headSubRef.current = await Location.watchHeadingAsync((h) => {
        if (!active) return;
        setHeading(h.trueHeading >= 0 ? h.trueHeading : h.magHeading);
      });
    })();
    return () => {
      active = false;
      locSubRef.current?.remove();
      headSubRef.current?.remove();
      Speech.stop();
    };
  }, [hasGPS, targetLat, targetLng]);

  // Object Detection Scanning Loop
  useEffect(() => {
    if (distance !== null && distance <= 10 && !isLookingAtObject && viewMode === 'ar') {
      if (!scanIntervalRef.current) {
        scanIntervalRef.current = setInterval(async () => {
          if (isScanningRef.current || !cameraRef.current || isLookingAtObject) return;
          isScanningRef.current = true;
          try {
            const snap = await cameraRef.current.takePictureAsync({ quality: 0.1, base64: false });
            if (snap?.uri) {
              const form = new FormData();
              form.append('file', { uri: snap.uri, name: 'scan.jpg', type: 'image/jpeg' } as any);
              const axios = require('axios');
              const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.80:5000';
              const res = await axios.post(`${BASE_URL}/api/admin/behavior/detect-objects`, form, {
                headers: { 'Content-Type': 'multipart/form-data' }, timeout: 5000
              });
              const results = res.data.detections || [];
              const searchTarget = objectName.toLowerCase().replace(/[?.,!]/g, '').trim();
              const found = results.find((d: any) => {
                const lbl = (d.label || d.class || d.class_name || '').toLowerCase();
                return lbl.includes(searchTarget) || searchTarget.includes(lbl);
              });
              if (found) {
                setIsLookingAtObject(true);
                speak('foundHere', objectName);
                if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
              }
            }
          } catch (e) {
          } finally {
            isScanningRef.current = false;
          }
        }, 2000);
      }
    } else {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    }
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, [distance, isLookingAtObject, objectName, viewMode]);

  useEffect(() => {
    if (!permission?.granted) requestPermission();
    speak('start', objectName);
  }, []);

  if (!permission?.granted) {
    return (
      <View style={s.center}>
        <Ionicons name="camera-outline" size={64} color="#f59e0b" />
        <Text style={s.permText}>Camera permission needed for Navigation</Text>
        <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
          <Text style={s.permBtnText}>Grant Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const arrow1Op = arrowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] });
  const arrow2Op = arrowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.65] });
  const arrow3Op = arrowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.35] });
  const reachScale = reachAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {viewMode === 'ar' ? (
        <>
          {/* Live back camera */}
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
          {/* Target locked visual */}
          {isLookingAtObject && (
            <View style={[StyleSheet.absoluteFill, { borderWidth: 8, borderColor: '#4ade80', zIndex: 10 }]} pointerEvents="none" />
          )}
        </>
      ) : (
        <>
          {hasGPS && userLoc && (
            <MapView
              provider={PROVIDER_DEFAULT}
              style={StyleSheet.absoluteFill}
              initialRegion={{
                latitude: userLoc.latitude,
                longitude: userLoc.longitude,
                latitudeDelta: 0.002,
                longitudeDelta: 0.002,
              }}
              showsUserLocation={true}
              showsCompass={true}
            >
              <Marker
                coordinate={{ latitude: targetLat, longitude: targetLng }}
                title={objectName}
                description="Object Location"
              />
              <Polyline
                coordinates={[
                  { latitude: userLoc.latitude, longitude: userLoc.longitude },
                  { latitude: targetLat, longitude: targetLng }
                ]}
                strokeColor="#3b82f6"
                strokeWidth={4}
                lineDashPattern={[1, 5]}
              />
            </MapView>
          )}
        </>
      )}

      {/* Dark vignette */}
      <View style={s.topGrad} pointerEvents="none" />
      <View style={s.bottomGrad} pointerEvents="none" />

      {/* Header */}
      <SafeAreaView style={s.safeTop}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => { Speech.stop(); router.back(); }}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={s.liveChip}>
              <View style={s.liveDot} />
              <Text style={s.liveText}>{viewMode === 'ar' ? 'Real View Navigation' : '3D Map Navigation'}</Text>
            </View>
            <Text style={s.headerObj}>{objectName}</Text>
          </View>
          <TouchableOpacity
            style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, marginRight: 8 }}
            onPress={() => setLang(l => (l === 'en' ? 'si' : 'en'))}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
              {lang === 'en' ? 'සිංහල' : 'English'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 }}
            onPress={() => setViewMode(v => v === 'ar' ? 'map' : 'ar')}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
              {viewMode === 'ar' ? 'Show Map' : 'Show AR'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Yellow arrows */}
      {!reached && (
        <View style={s.arrowWrap} pointerEvents="none">
          <View style={{ transform: [{ rotate: `${arrowRotation}deg` }], alignItems: "center" }}>
            <Animated.Text style={[s.arrowChar, { opacity: arrow1Op, fontSize: 100 }]}>›</Animated.Text>
            <Animated.Text style={[s.arrowChar, { opacity: arrow2Op, fontSize: 76, marginTop: -36 }]}>›</Animated.Text>
            <Animated.Text style={[s.arrowChar, { opacity: arrow3Op, fontSize: 52, marginTop: -26 }]}>›</Animated.Text>
          </View>
        </View>
      )}

      {/* Reached banner */}
      {reached && (
        <Animated.View style={[s.reachedBanner, { transform: [{ scale: reachScale }] }]} pointerEvents="none">
          <Text style={{ fontSize: 60 }}>🎯</Text>
          <Text style={s.reachedTitle}>You have Arrived!</Text>
          <Text style={s.reachedSub}>Your {objectName} is right here</Text>
        </Animated.View>
      )}

      {/* Bottom panel */}
      <View style={s.panel}>
        {/* Metrics */}
        <View style={s.metricRow}>
          <View style={s.metricCard}>
            <Ionicons name="navigate" size={20} color="#f59e0b" />
            <Text style={s.metVal}>{distance != null ? (distance < 1000 ? `${distance}m` : `${(distance/1000).toFixed(1)}km`) : "---"}</Text>
            <Text style={s.metLbl}>Distance</Text>
          </View>
          <View style={s.metricCard}>
            <Ionicons name="time" size={20} color="#34d399" />
            <Text style={s.metVal}>{etaLabel}</Text>
            <Text style={s.metLbl}>Walk Time</Text>
          </View>
          <View style={s.metricCard}>
            <Ionicons name="walk" size={20} color="#60a5fa" />
            <Text style={s.metVal}>1.4 m/s</Text>
            <Text style={s.metLbl}>Speed</Text>
          </View>
        </View>

        {/* Speak button */}
        <TouchableOpacity
          style={s.speakBtn}
          onPress={() => {
            if (!distance) { speak('locating'); return; }
            if (distance < 3) {
              speak('rightHere', objectName);
            } else {
              speak('fullDirection', objectName, distance, etaLabel);
            }
          }}
        >
          <Ionicons name="volume-high" size={22} color="#000" />
          <Text style={s.speakTxt}>Speak Directions</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, backgroundColor: "#0f172a", justifyContent: "center", alignItems: "center", padding: 32, gap: 16 },
  permText: { color: "#f1f5f9", fontSize: 18, fontWeight: "700", textAlign: "center" },
  permBtn: { backgroundColor: "#f59e0b", paddingHorizontal: 28, paddingVertical: 14, borderRadius: 20 },
  permBtnText: { color: "#000", fontWeight: "900", fontSize: 16 },
  topGrad: { position: "absolute", top: 0, left: 0, right: 0, height: 160, backgroundColor: "rgba(0,0,0,0.55)" },
  bottomGrad: { position: "absolute", bottom: 0, left: 0, right: 0, height: 270, backgroundColor: "rgba(0,0,0,0.72)" },
  safeTop: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 20 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 14 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  liveChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginBottom: 4 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#4ade80" },
  liveText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  headerObj: { color: "#fff", fontSize: 22, fontWeight: "900" },
  arrowWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center", zIndex: 10 },
  arrowChar: { color: "#facc15", fontWeight: "900", lineHeight: 88, includeFontPadding: false },
  reachedBanner: { position: "absolute", top: "28%", alignSelf: "center", zIndex: 30, backgroundColor: "rgba(0,0,0,0.88)", borderRadius: 28, paddingHorizontal: 40, paddingVertical: 28, alignItems: "center", borderWidth: 2, borderColor: "#4ade80" },
  reachedTitle: { color: "#4ade80", fontSize: 28, fontWeight: "900", marginTop: 8 },
  reachedSub: { color: "#d1fae5", fontSize: 16, fontWeight: "600", marginTop: 4 },
  panel: { position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 20, paddingHorizontal: 20, paddingBottom: Platform.OS === "ios" ? 40 : 24, paddingTop: 16, gap: 14 },
  metricRow: { flexDirection: "row", gap: 10 },
  metricCard: { flex: 1, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 18, paddingVertical: 14, alignItems: "center", gap: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  metVal: { color: "#fff", fontSize: 20, fontWeight: "900" },
  metLbl: { color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: "600" },
  speakBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#f59e0b", borderRadius: 18, paddingVertical: 16 },
  speakTxt: { color: "#000", fontSize: 17, fontWeight: "900" },
});
