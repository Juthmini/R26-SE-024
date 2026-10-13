import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://172.20.10.3:5000';
const SCAN_URL = `${BASE_URL}/api/admin/personal-objects/scan`;

// Same fixed list used at registration (web admin's Personal Vault checklist)
// and the backend's YOLO-World open-vocabulary classes - keeping one list in
// both places means the name a patient searches for always matches a name a
// caregiver could have registered.
const COMMON_ITEMS = ['Glasses', 'Wallet', 'Pill Box', 'Hearing Aid Case', 'Keys', 'TV Remote'];

type ScanState = 'idle' | 'scanning' | 'found' | 'not_registered';

export default function FindMyThingsScanScreen() {
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [resultText, setResultText] = useState('');
  const [attempts, setAttempts] = useState(0);
  // Starts as the fixed common-item list; any extra custom-named items the
  // caregiver actually registered (e.g. "Bottle" via "Other" at upload time)
  // get appended once fetched, so the picker always matches what's real for
  // this patient, not just the 6 YOLO-World default categories.
  const [pickerItems, setPickerItems] = useState<string[]>(COMMON_ITEMS);

  const isBusyRef = useRef(false);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const attemptsRef = useRef(0);

  const stopScanning = () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    scanIntervalRef.current = null;
  };

  useEffect(() => stopScanning, []);

  useEffect(() => {
    (async () => {
      const patientId = await getPatientId();
      if (!patientId) return;
      try {
        const res = await axios.get(`${BASE_URL}/api/admin/personal-objects/patient/${patientId}`, { timeout: 10000 });
        const registeredNames: string[] = (res.data?.data || [])
          .map((item: any) => (item.objectName || '').trim())
          .filter(Boolean);

        const seen = new Set(COMMON_ITEMS.map((n) => n.toLowerCase()));
        const extras = registeredNames.filter((name) => {
          const key = name.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        if (extras.length) setPickerItems([...COMMON_ITEMS, ...extras]);
      } catch {
        // Keep the fixed common-item list if this fetch fails - not a blocker.
      }
    })();
  }, []);

  const getPatientId = async (): Promise<string | null> => {
    const stored = await AsyncStorage.getItem('patient');
    if (!stored) return null;
    const p = JSON.parse(stored);
    // Must be the real Mongo ObjectId, not the display code (customerCode is
    // a human-readable label like "EXT-61C916" - passing it to the backend
    // crashes PersonalObject lookups with a CastError, since it isn't a valid
    // ObjectId). id/_id first; customerCode is never a valid fallback here.
    return p.id || p._id || null;
  };

  const startScanning = async (item: string) => {
    setSelectedItem(item);
    setScanState('scanning');
    setResultText('');
    attemptsRef.current = 0;
    setAttempts(0);

    const patientId = await getPatientId();
    if (!patientId) {
      setResultText("Couldn't find your patient profile. Please log in again.");
      setScanState('idle');
      return;
    }

    scanIntervalRef.current = setInterval(() => runOneScan(item, patientId), 2000);
  };

  const runOneScan = async (item: string, patientId: string) => {
    if (isBusyRef.current || !cameraRef.current) return;
    isBusyRef.current = true;
    try {
      const snap = await cameraRef.current.takePictureAsync({ quality: 0.4, base64: false });
      if (!snap?.uri) return;

      const form = new FormData();
      form.append('file', { uri: snap.uri, name: 'scan.jpg', type: 'image/jpeg' } as any);
      form.append('patientId', patientId);
      form.append('itemName', item.toLowerCase());

      const res = await axios.post(SCAN_URL, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 15000,
      });
      const data = res.data;

      if (data.found === false && data.message && data.message.includes('not been registered')) {
        stopScanning();
        setScanState('not_registered');
        setResultText(`"${item}" hasn't been registered yet. Ask your caregiver to add a photo of it in Personal Vault first.`);
        return;
      }

      if (data.found) {
        stopScanning();
        const direction = data.direction || 'nearby';
        const confidence = data.confidence ?? '';
        const text = `I found your ${item}. It's ${direction === 'center' ? 'right in front of you' : `to your ${direction}`}.`;
        setScanState('found');
        setResultText(`${text} (${confidence}% match)`);
        Speech.speak(text, { language: 'en-US', rate: 0.95 });
      } else {
        attemptsRef.current += 1;
        setAttempts(attemptsRef.current);
        if (attemptsRef.current === 5) {
          Speech.speak(`Still looking for your ${item}. Keep moving the camera around the room.`, { language: 'en-US' });
        }
      }
    } catch (e) {
      // Transient network hiccups shouldn't stop the loop - just skip this frame.
    } finally {
      isBusyRef.current = false;
    }
  };

  const reset = () => {
    stopScanning();
    setSelectedItem(null);
    setScanState('idle');
    setResultText('');
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={26} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Find My Things</Text>
        <View style={{ width: 26 }} />
      </View>

      {!selectedItem ? (
        <View style={styles.pickerBox}>
          <Text style={styles.pickerPrompt}>What are you looking for?</Text>
          <View style={styles.itemGrid}>
            {pickerItems.map((item) => (
              <TouchableOpacity key={item} style={styles.itemBtn} onPress={() => startScanning(item)}>
                <Ionicons name="search" size={22} color="#3b82f6" />
                <Text style={styles.itemBtnText}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.scanBox}>
          <CameraView ref={cameraRef} style={styles.camera} facing="back" />

          <View style={styles.overlay}>
            {scanState === 'scanning' && (
              <>
                <Ionicons name="scan" size={40} color="#fff" />
                <Text style={styles.overlayText}>Looking for your {selectedItem}...</Text>
                <Text style={styles.overlaySubText}>Slowly move your phone around the room</Text>
              </>
            )}
            {scanState === 'found' && (
              <>
                <Ionicons name="checkmark-circle" size={48} color="#22c55e" />
                <Text style={styles.overlayText}>{resultText}</Text>
              </>
            )}
            {scanState === 'not_registered' && (
              <>
                <Ionicons name="alert-circle" size={44} color="#f59e0b" />
                <Text style={styles.overlayText}>{resultText}</Text>
              </>
            )}
          </View>

          <TouchableOpacity style={styles.stopBtn} onPress={reset}>
            <Text style={styles.stopBtnText}>
              {scanState === 'scanning' ? 'Cancel' : 'Search for something else'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eff6ff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#1e293b' },
  pickerBox: { flex: 1, padding: 24, justifyContent: 'center' },
  pickerPrompt: { fontSize: 22, fontWeight: '700', color: '#1e293b', marginBottom: 20, textAlign: 'center' },
  itemGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14 },
  itemBtn: {
    width: 150, backgroundColor: '#fff', borderRadius: 20, padding: 18, alignItems: 'center',
    gap: 8, borderWidth: 1, borderColor: '#dbeafe', elevation: 2,
  },
  itemBtnText: { fontSize: 16, fontWeight: '700', color: '#1e293b', textAlign: 'center' },
  scanBox: { flex: 1 },
  camera: { flex: 1 },
  overlay: {
    position: 'absolute', left: 20, right: 20, bottom: 110, backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 20, padding: 20, alignItems: 'center', gap: 8,
  },
  overlayText: { color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  overlaySubText: { color: '#cbd5e1', fontSize: 13, textAlign: 'center' },
  stopBtn: {
    position: 'absolute', bottom: 30, alignSelf: 'center', backgroundColor: '#ef4444',
    paddingHorizontal: 28, paddingVertical: 14, borderRadius: 999,
  },
  stopBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  permBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  permTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  permBtn: { backgroundColor: '#3b82f6', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14 },
  permBtnText: { color: '#fff', fontWeight: '700' },
});
