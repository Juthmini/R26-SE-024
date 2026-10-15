import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Image, ScrollView, ActivityIndicator, TextInput, Modal, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL    = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.80:5000';
const DETECT_URL  = `${BASE_URL}/api/admin/behavior/detect-objects`;
const UPSERT_URL  = `${BASE_URL}/api/life-logging/objects/upsert`;
const LOCATION_URL = `${BASE_URL}/api/admin/behavior/object-location`;
const OFFLINE_QUEUE_KEY = 'offline_object_queue';

const ROOMS = ['Bedroom', 'Bathroom', 'Living Room', 'Kitchen', 'Dining Room', 'Study Room', 'Hallway', 'Outside'];

interface Detection {
  label: string;
  confidence: number; // 0-100
}

export default function ObjectDetectorScreen() {
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');

  const [photo, setPhoto]           = useState<string | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [scanning, setScanning]     = useState(false);
  const [gpsStatus, setGpsStatus]   = useState<string>('');

  // Auto-saved banner
  const [autoSaved, setAutoSaved] = useState<string | null>(null);

  // Manual room-save modal (for lower confidence items)
  const [showModal, setShowModal]       = useState(false);
  const [selectedObject, setSelectedObject] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('');
  const [locDetail, setLocDetail]       = useState('');
  const [saving, setSaving]             = useState(false);
  const [savedMsg, setSavedMsg]         = useState<string | null>(null);

  // Cached GPS
  const gpsRef = useRef<{ lat: number; lng: number } | null>(null);

  // Live Auditory Feedback logic
  const liveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isScanningRef = useRef(false);
  const lastSpokenRef = useRef<string>('');

  useEffect(() => {
    if (permission?.granted && !photo && !showModal) {
      liveIntervalRef.current = setInterval(() => {
        performLiveScan();
      }, 3500);
    } else {
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
    }
    return () => {
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
    };
  }, [permission, photo, showModal]);

  const performLiveScan = async () => {
    if (isScanningRef.current || !cameraRef.current) return;
    isScanningRef.current = true;
    try {
      const snap = await cameraRef.current.takePictureAsync({ quality: 0.1, base64: false });
      if (!snap?.uri) { isScanningRef.current = false; return; }

      const form = new FormData();
      form.append('file', { uri: snap.uri, name: 'live.jpg', type: 'image/jpeg' } as any);

      const res = await axios.post(DETECT_URL, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 10000,
      });

      const results = (res.data.detections || [])
        .map((d: any) => ({
          label: d.label || d.class || d.class_name || 'Object',
          confidence: Math.round((d.confidence || 0) * 100),
        }))
        .sort((a: any, b: any) => b.confidence - a.confidence);

      if (results.length > 0) {
        const topObject = results[0].label;
        if (topObject !== lastSpokenRef.current && results[0].confidence > 40) {
          lastSpokenRef.current = topObject;
          Speech.speak(`I see a ${topObject}`, { language: 'en-US', rate: 0.95 });
          
          setAutoSaved(`Detected: ${topObject}`);
          setTimeout(() => setAutoSaved(null), 3000);
          
          // Silently save
          await autoSaveTopObject(results[0], snap.uri);
        }
      }
    } catch (e) {
      // ignore
    } finally {
      isScanningRef.current = false;
    }
  };

  useEffect(() => {
    getGPS();
  }, []);

  const getGPS = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGpsStatus('Location permission denied');
        return;
      }
      setGpsStatus('Getting location...');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      gpsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setGpsStatus(`GPS: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
    } catch {
      setGpsStatus('GPS unavailable');
    }
  };


  // ── Offline queue flush ───────────────────────────────────────────────────
  const flushOfflineQueue = async () => {
    try {
      const qStr = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      if (!qStr) return;
      const queue: any[] = JSON.parse(qStr);
      if (queue.length === 0) return;
      const remaining: any[] = [];
      for (const item of queue) {
        try {
          await axios.post(UPSERT_URL, item, { timeout: 8000 });
        } catch {
          remaining.push(item); // keep if still offline
        }
      }
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
    } catch {}
  };

  const queueOrSend = async (payload: object) => {
    try {
      await axios.post(UPSERT_URL, payload, { timeout: 8000 });
      await flushOfflineQueue(); // flush any previously stored items
    } catch {
      // Offline – store locally
      const qStr = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      const queue = qStr ? JSON.parse(qStr) : [];
      queue.push(payload);
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    }
  };

  const getPatientId = async (): Promise<string | null> => {
    const stored = await AsyncStorage.getItem('patient');
    if (!stored) return null;
    return JSON.parse(stored).id;
  };

  if (!permission) return <View style={styles.container} />;
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permBox}>
          <Ionicons name="camera-outline" size={56} color="#3b82f6" />
          <Text style={styles.permTitle}>Camera Access Needed</Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Allow Camera</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Auto-save the top detection & My Memories feature ─────────────────────
  const autoSaveTopObject = async (topDetection: Detection, photoUri: string | null) => {
    const patientId = await getPatientId();
    if (!patientId) return;

    try {
      // Validation: Check if already detected for this patient
      const memKey = `patient_memories_${patientId}`;
      const storedMemoriesStr = await AsyncStorage.getItem(memKey);
      let storedMemories = storedMemoriesStr ? JSON.parse(storedMemoriesStr) : [];
      
      const objectNameLower = topDetection.label.toLowerCase();
      // --- AI ROUTINE VALIDATOR LOGIC ---
      try {
        const storedRoutineStr = await AsyncStorage.getItem('patient_routine');
        if (storedRoutineStr) {
          const routine = JSON.parse(storedRoutineStr);
          const currentHour = new Date().getHours().toString();
          const currentActivity = routine[currentHour];
          
          if (currentActivity) {
            const act = currentActivity.toLowerCase();
            const obj = objectNameLower;
            let matched = false;
            let msg = '';
            let speechMsg = '';
            
            if (act === 'medication' && (obj.includes('bottle') || obj.includes('cup') || obj.includes('pill'))) {
              matched = true;
              msg = 'ඔබේ බෙහෙත් බීම සාර්ථකව හඳුනාගත්තා. කාලසටහන යාවත්කාලීන වුණා!';
              speechMsg = 'Obe beheth beema saarthakawa handunaa gaththa. Kaala-satahana update wunaa!';
            } else if (act === 'eating' && (obj.includes('apple') || obj.includes('bowl') || obj.includes('cup') || obj.includes('plate') || obj.includes('pizza') || obj.includes('donut'))) {
              matched = true;
              msg = 'ඔබේ ආහාර ගැනීම සාර්ථකව හඳුනාගත්තා!';
              speechMsg = 'Obe aahaara geneema saarthakawa handunaa gaththa!';
            } else if (act === 'bathing' && (obj.includes('toothbrush') || obj.includes('sink'))) {
              matched = true;
              msg = 'ඔබේ දත් මැදීම සාර්ථකව හඳුනාගත්තා!';
              speechMsg = 'Obe dath medeema saarthakawa handunaa gaththa!';
            }

            if (matched) {
              Speech.speak(speechMsg, { language: 'en-US', rate: 0.9 });
              // We could also call an API here to formally log it!
              setAutoSaved(`✅ Routine Completed: ${currentActivity}!`);
            }
          }
        }
      } catch (e) {
        console.warn("Routine validation error", e);
      }
      // ----------------------------------

      const alreadyExists = storedMemories.some((m: any) => m.name.toLowerCase() === objectNameLower);
      
      if (alreadyExists) {
        Speech.speak(`You already saved your ${topDetection.label} in your memories.`, { language: 'en-US' });
        setAutoSaved(`⚠️ Already in Memories: "${topDetection.label}"`);
        return;
      }

      // 1) Send GPS location to backend
      await axios.post(LOCATION_URL, {
        patientId,
        objectName: topDetection.label,
        roomLabel: 'Unknown',
        locationDetail: '',
        lat: gpsRef.current?.lat ?? null,
        lng: gpsRef.current?.lng ?? null,
        confidence: topDetection.confidence,
      });

      // 2) Trigger Smart Routine Linking (Auto-tick)
      if (objectNameLower.includes('toothbrush') || objectNameLower.includes('medicine') || objectNameLower.includes('pill')) {
        const hour = new Date().getHours();
        let routineMsg = '';
        if (objectNameLower.includes('toothbrush') && hour < 10) routineMsg = 'Have you brushed your teeth this morning?';
        else if (objectNameLower.includes('toothbrush') && hour > 20) routineMsg = 'Have you brushed your teeth for the night?';
        else if ((objectNameLower.includes('medicine') || objectNameLower.includes('pill')) && hour < 12) routineMsg = 'Is it time for your morning medicine?';

        if (routineMsg) {
          setTimeout(() => {
            Speech.speak(routineMsg, { language: 'en-US' });
            Alert.alert(
              "Routine Reminder 🗓️",
              routineMsg,
              [
                { text: "Not yet", style: "cancel" },
                { text: "Yes, I did!", onPress: () => {
                  Speech.speak("Great job completing your routine!", { language: 'en-US' });
                  setAutoSaved(`✅ Routine Completed: ${objectNameLower}`);
                }}
              ]
            );
          }, 1500); // give it a moment after initial detection speech
        }
      }

      // 3) Save to My Memories (AsyncStorage)
      const newMemory = {
        id: Date.now().toString(),
        name: topDetection.label,
        relationship: 'Object',
        image: photoUri,
        color: '#EEF4FF',
        lat: gpsRef.current?.lat ?? null,
        lng: gpsRef.current?.lng ?? null
      };
      storedMemories.push(newMemory);
      await AsyncStorage.setItem(memKey, JSON.stringify(storedMemories));

      setAutoSaved(
        `✅ Saved to Memories: "${topDetection.label}" (${topDetection.confidence}%)` +
        (gpsRef.current ? ` · GPS recorded` : ' · No GPS')
      );
    } catch (error) {
      setAutoSaved('⚠️ Auto-save failed — no connection');
    }
  };

  // ── Capture + Detect ──────────────────────────────────────────────────────
  const captureAndDetect = async () => {
    if (!cameraRef.current || scanning) return;
    setScanning(true);
    setError('');
    setDetections([]);
    setPhoto(null);
    setAutoSaved(null);
    setSavedMsg(null);

    // Refresh GPS silently
    if (!gpsRef.current) await getGPS();
    else {
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then(p => { gpsRef.current = { lat: p.coords.latitude, lng: p.coords.longitude }; })
        .catch(() => {});
    }

    try {
      const snap = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: false });
      if (!snap?.uri) throw new Error('Camera failed to capture');
      setPhoto(snap.uri);
      setLoading(true);

      const form = new FormData();
      form.append('file', { uri: snap.uri, name: 'scan.jpg', type: 'image/jpeg' } as any);

      const res = await axios.post(DETECT_URL, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 20000,
      });

      const results: Detection[] = (res.data.detections || [])
        .map((d: any) => ({
          label: d.label || d.class || d.class_name || 'Object',
          confidence: Math.round((d.confidence || 0) * 100),
        }))
        .sort((a: Detection, b: Detection) => b.confidence - a.confidence); // highest first

      setDetections(results);

      if (results.length === 0) {
        Speech.speak('No objects detected. Try pointing at something clearly.', { language: 'en-US', rate: 0.9 });
      } else {
        // Speak all detections
        const names = results.map(d => d.label);
        const sentence = names.length === 1
          ? `I can see a ${names[0]}`
          : `I can see ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
        Speech.speak(sentence, { language: 'en-US', rate: 0.85, pitch: 1.0 });

        // Auto-save highest confidence object
        await autoSaveTopObject(results[0], snap.uri);
      }
    } catch (err: any) {
      const msg = err.code === 'ERR_NETWORK'
        ? `Cannot reach server at ${BASE_URL}`
        : err.message || 'Detection failed';
      setError(msg);
      Speech.speak('Detection failed. Please try again.', { language: 'en-US' });
    } finally {
      setLoading(false);
      setScanning(false);
    }
  };

  // ── Manual save with room label ───────────────────────────────────────────
  const openRoomModal = (label: string) => {
    setSelectedObject(label);
    setSelectedRoom('');
    setLocDetail('');
    setShowModal(true);
  };

  const saveWithRoom = async () => {
    if (!selectedRoom) return;
    setSaving(true);
    try {
      const patientId = await getPatientId();
      if (!patientId) throw new Error('Not logged in');

      await axios.post(LOCATION_URL, {
        patientId,
        objectName: selectedObject,
        roomLabel: selectedRoom,
        locationDetail: locDetail.trim(),
        lat: gpsRef.current?.lat ?? null,
        lng: gpsRef.current?.lng ?? null,
        confidence: detections.find(d => d.label === selectedObject)?.confidence || 0,
      });

      Speech.speak(`Got it! ${selectedObject} location updated as ${selectedRoom}.`, { language: 'en-US', rate: 0.9 });
      setSavedMsg(`📍 ${selectedObject} saved in ${selectedRoom}`);
      setShowModal(false);
    } catch {
      Speech.speak('Could not save. Please try again.', { language: 'en-US' });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setPhoto(null); setDetections([]); setError('');
    setAutoSaved(null); setSavedMsg(null);
  };

  const LABEL_COLORS: Record<string, string> = {
    toothbrush: '#22c55e', cup: '#06b6d4', bottle: '#3b82f6',
    person: '#ef4444', chair: '#f97316', book: '#a855f7',
    cell_phone: '#ec4899', laptop: '#10b981', remote: '#8b5cf6',
  };
  const getColor = (label: string) => LABEL_COLORS[label.toLowerCase().replace(/ /g, '_')] || '#3b82f6';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={22} color="#f1f5f9" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginHorizontal: 8 }}>
          <Text style={styles.headerTitle}>Object Detector</Text>
          <Text style={styles.gpsText} numberOfLines={1}>{gpsStatus}</Text>
        </View>
        <TouchableOpacity onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')} style={styles.headerBtn}>
          <Ionicons name="camera-reverse-outline" size={22} color="#f1f5f9" />
        </TouchableOpacity>
      </View>

      {photo ? (
        <ScrollView contentContainerStyle={styles.resultScroll}>
          <Image source={{ uri: photo }} style={styles.capturedPhoto} resizeMode="cover" />

          {loading ? (
            <View style={styles.analyzing}>
              <ActivityIndicator color="#3b82f6" size="large" />
              <Text style={styles.analyzingText}>AI analyzing image...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorBox}>
              <Ionicons name="warning" size={22} color="#fca5a5" />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={reset}>
                <Text style={styles.retryText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Auto-save banner */}
              {autoSaved && (
                <View style={styles.autoSaveBanner}>
                  <Text style={styles.autoSaveText}>{autoSaved}</Text>
                </View>
              )}
              {savedMsg && (
                <View style={styles.savedBanner}>
                  <Text style={styles.savedText}>{savedMsg}</Text>
                </View>
              )}

              <View style={styles.resultsHeader}>
                <Text style={styles.resultsTitle}>
                  {detections.length === 0 ? '🔍 Nothing detected' : `✅ ${detections.length} object(s) found`}
                </Text>
                <TouchableOpacity
                  style={styles.stopBtn}
                  onPress={() => Speech.stop()}
                >
                  <Ionicons name="stop-circle" size={16} color="#fff" />
                  <Text style={styles.stopBtnText}>Stop</Text>
                </TouchableOpacity>
              </View>

              {detections.map((d, i) => {
                const color = getColor(d.label);
                const isTop = i === 0;
                return (
                  <View key={i} style={[styles.detectionRow, { borderLeftColor: color }, isTop && styles.topRow]}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.labelRow}>
                        <Text style={styles.detectionLabel}>{d.label}</Text>
                        {isTop && <View style={styles.topBadge}><Text style={styles.topText}>AUTO-SAVED</Text></View>}
                      </View>
                      <Text style={styles.detectionConf}>{d.confidence}% confidence</Text>
                      <View style={[styles.confBar, { backgroundColor: color + '22' }]}>
                        <View style={[styles.confFill, { width: `${d.confidence}%` as any, backgroundColor: color }]} />
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[styles.saveLocBtn, { borderColor: color }]}
                      onPress={() => openRoomModal(d.label)}
                    >
                      <Ionicons name="location" size={13} color={color} />
                      <Text style={[styles.saveLocText, { color }]}>Add Room</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}

              <View style={styles.bottomActions}>
                <TouchableOpacity style={styles.speakAllBtn}
                  onPress={() => {
                    if (detections.length > 0) {
                      const s = detections.map(d => d.label).join(', ');
                      Speech.speak(`I can see ${s}`, { language: 'en-US', rate: 0.85 });
                    }
                  }}>
                  <Ionicons name="volume-high" size={18} color="#7c3aed" />
                  <Text style={styles.speakAllText}>Speak All</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.scanAgainBtn} onPress={reset}>
                  <Ionicons name="camera" size={18} color="#0f172a" />
                  <Text style={styles.scanAgainText}>Scan Again</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      ) : (
        <View style={styles.cameraContainer}>
          <View style={StyleSheet.absoluteFillObject}>
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing={facing} />
            <View style={styles.scanFrame}>
              {['cornerTL','cornerTR','cornerBL','cornerBR'].map(c => (
                <View key={c} style={[styles.corner, styles[c as keyof typeof styles] as any]} />
              ))}
            </View>
            <Text style={styles.scanHint}>Point at object {'->'} Tap Scan{'\n'}Highest confidence auto-saved with GPS</Text>
          </View>
          <View style={styles.captureBar}>
            <TouchableOpacity
              style={[styles.captureBtn, scanning && styles.captureBtnDisabled]}
              onPress={captureAndDetect} disabled={scanning}
            >
              {scanning
                ? <ActivityIndicator color="#fff" size="large" />
                : <Ionicons name="scan" size={36} color="#fff" />}
            </TouchableOpacity>
            <Text style={styles.captureHint}>{scanning ? 'Analyzing...' : 'Tap to scan manually'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <ActivityIndicator color="#3b82f6" size="small" />
              <Text style={{ color: '#3b82f6', fontSize: 11, fontWeight: '700' }}>Live Scanning Active</Text>
            </View>
          </View>
        </View>
      )}

      {/* ── Add Room Modal ───────────────────────────────────────────── */}
      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>📍 Which room is this {selectedObject}?</Text>
            <Text style={styles.modalSub}>GPS already saved. Add room label for easy navigation.</Text>
            <View style={styles.roomGrid}>
              {ROOMS.map(r => (
                <TouchableOpacity key={r}
                  style={[styles.roomChip, selectedRoom === r && styles.roomChipSel]}
                  onPress={() => setSelectedRoom(r)}>
                  <Text style={[styles.roomChipText, selectedRoom === r && styles.roomChipTextSel]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.detailInput}
              placeholder="More detail? e.g. on the shelf, near the sink"
              placeholderTextColor="#475569"
              value={locDetail}
              onChangeText={setLocDetail}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, (!selectedRoom || saving) && styles.confirmBtnDis]}
                onPress={saveWithRoom} disabled={!selectedRoom || saving}
              >
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.confirmText}>Save Room</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 4 },
  headerBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#f1f5f9', fontSize: 16, fontWeight: '900' },
  gpsText: { color: '#22c55e', fontSize: 10, fontWeight: '600', marginTop: 2 },

  permBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 16 },
  permTitle: { color: '#f1f5f9', fontSize: 20, fontWeight: '900' },
  permBtn: { backgroundColor: '#3b82f6', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 14 },
  permBtnText: { color: '#fff', fontWeight: '900' },

  cameraContainer: { flex: 1 },
  camera: { flex: 1 },
  scanFrame: { position: 'absolute', top: '22%', left: '12%', right: '12%', bottom: '28%' },
  corner: { position: 'absolute', width: 28, height: 28, borderColor: '#3b82f6', borderWidth: 3 },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  scanHint: { position: 'absolute', bottom: 105, alignSelf: 'center', color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600', textAlign: 'center', paddingHorizontal: 20 },
  captureBar: { alignItems: 'center', paddingVertical: 26, gap: 8, backgroundColor: '#0f172a' },
  captureBtn: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#3b82f6', alignItems: 'center', justifyContent: 'center', elevation: 10 },
  captureBtnDisabled: { opacity: 0.6 },
  captureHint: { color: '#475569', fontSize: 12, fontWeight: '600' },

  resultScroll: { padding: 16, gap: 12, paddingBottom: 40 },
  capturedPhoto: { width: '100%', height: 240, borderRadius: 20 },
  analyzing: { alignItems: 'center', padding: 30, gap: 12 },
  analyzingText: { color: '#64748b', fontSize: 14, fontWeight: '600' },
  errorBox: { backgroundColor: '#450a0a', borderRadius: 20, padding: 20, alignItems: 'center', gap: 10 },
  errorText: { color: '#fca5a5', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  retryBtn: { backgroundColor: '#7f1d1d', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 12 },
  retryText: { color: '#fca5a5', fontWeight: '700' },

  autoSaveBanner: { backgroundColor: '#052e16', borderRadius: 14, padding: 12 },
  autoSaveText: { color: '#4ade80', fontSize: 12, fontWeight: '700' },
  savedBanner: { backgroundColor: '#1e3a5f', borderRadius: 14, padding: 12 },
  savedText: { color: '#93c5fd', fontSize: 12, fontWeight: '700' },

  resultsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultsTitle: { color: '#f1f5f9', fontSize: 17, fontWeight: '900' },
  stopBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#334155', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  stopBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  detectionRow: { backgroundColor: '#1e293b', borderRadius: 16, padding: 14, borderLeftWidth: 4, flexDirection: 'row', alignItems: 'center', gap: 10 },
  topRow: { borderColor: '#22c55e', borderWidth: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detectionLabel: { color: '#f1f5f9', fontSize: 17, fontWeight: '900', textTransform: 'capitalize' },
  topBadge: { backgroundColor: '#14532d', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  topText: { color: '#4ade80', fontSize: 9, fontWeight: '900' },
  detectionConf: { color: '#64748b', fontSize: 11, fontWeight: '600', marginVertical: 4 },
  confBar: { height: 5, borderRadius: 3, overflow: 'hidden' },
  confFill: { height: '100%', borderRadius: 3 },
  saveLocBtn: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6, alignItems: 'center', gap: 3 },
  saveLocText: { fontSize: 10, fontWeight: '800' },

  bottomActions: { flexDirection: 'row', gap: 10 },
  speakAllBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1e293b', borderRadius: 16, paddingVertical: 14 },
  speakAllText: { color: '#a78bfa', fontWeight: '800', fontSize: 14 },
  scanAgainBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#f1f5f9', borderRadius: 16, paddingVertical: 14 },
  scanAgainText: { color: '#0f172a', fontWeight: '900', fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#1e293b', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 14 },
  modalTitle: { color: '#f1f5f9', fontSize: 18, fontWeight: '900' },
  modalSub: { color: '#64748b', fontSize: 12, marginTop: -8 },
  roomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roomChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#334155', backgroundColor: '#0f172a' },
  roomChipSel: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  roomChipText: { color: '#64748b', fontWeight: '700', fontSize: 13 },
  roomChipTextSel: { color: '#fff' },
  detailInput: { backgroundColor: '#0f172a', borderRadius: 14, padding: 12, color: '#f1f5f9', fontSize: 13, borderWidth: 1, borderColor: '#334155', minHeight: 56 },
  modalActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: '#334155', alignItems: 'center' },
  cancelText: { color: '#64748b', fontWeight: '700' },
  confirmBtn: { flex: 2, padding: 14, borderRadius: 14, backgroundColor: '#3b82f6', alignItems: 'center' },
  confirmBtnDis: { opacity: 0.5 },
  confirmText: { color: '#fff', fontWeight: '900', fontSize: 14 },
});
