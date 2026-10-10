import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, Switch, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as Speech from 'expo-speech';

const STORAGE_KEY = 'esp32_cam_settings';

export default function ESP32ConnectUI() {
  const router = useRouter();
  const [camIP, setCamIP] = useState('');
  const [patientId, setPatientId] = useState('');
  const [roomLabel, setRoomLabel] = useState('Living Room');
  const [autoScan, setAutoScan] = useState(false);
  const [intervalSecs, setIntervalSecs] = useState('10');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [scanCount, setScanCount] = useState(0);

  const autoScanRef = React.useRef<NodeJS.Timeout | null>(null);
  const isCapturingRef = React.useRef(false);

  const ROOMS = ['Bedroom', 'Living Room', 'Kitchen', 'Bathroom', 'Hallway', 'Outside'];

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      const s = JSON.parse(stored);
      setCamIP(s.camIP || '');
      setRoomLabel(s.roomLabel || 'Living Room');
      setIntervalSecs(s.intervalSecs || '10');
    }
    const patient = await AsyncStorage.getItem('patient');
    if (patient) setPatientId(JSON.parse(patient).id);
  };

  const saveSettings = async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ camIP, roomLabel, intervalSecs }));
  };

  const testConnection = async () => {
    if (!camIP) {
      Alert.alert('Error', 'Please enter the ESP32-CAM IP address');
      return;
    }
    setStatus('connecting');
    try {
      // Try to fetch a frame from ESP32-CAM stream
      await axios.get(`http://${camIP}/capture`, { timeout: 5000, responseType: 'arraybuffer' });
      setStatus('connected');
      Speech.speak('ESP32 camera connected successfully!', { language: 'en-US' });
      await saveSettings();
    } catch {
      setStatus('error');
      Speech.speak('Could not connect to camera. Check the IP address.', { language: 'en-US' });
    }
  };

  const captureSingle = async () => {
    if (!camIP || !patientId) return;
    setStatus('connecting');
    setLastResult(null);
    try {
      // Fetch image from ESP32-CAM
      const imgRes = await axios.get(`http://${camIP}/capture`, { timeout: 8000, responseType: 'arraybuffer' });
      const blob = new Blob([imgRes.data], { type: 'image/jpeg' });

      // Forward to backend for YOLO processing
      const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.80:5000';
      const form = new FormData();
      form.append('file', { uri: `data:image/jpeg;base64,${Buffer.from(imgRes.data).toString('base64')}`, name: 'esp32.jpg', type: 'image/jpeg' } as any);
      form.append('patientId', patientId);
      form.append('roomLabel', roomLabel);

      const res = await axios.post(`${BASE_URL}/api/life-logging/objects/pi-camera/upload`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 20000,
      });

      if (res.data.success) {
        const msg = `Detected ${res.data.detected} objects, saved ${res.data.saved} in ${roomLabel}`;
        setLastResult(msg);
        Speech.speak(msg, { language: 'en-US' });
        setStatus('connected');
      }
    } catch (e: any) {
      setStatus('error');
      setLastResult('Capture failed: ' + (e.message || 'Unknown error'));
    }
  };

  const statusColor = { idle: '#64748b', connecting: '#f59e0b', connected: '#22c55e', error: '#ef4444' };
  const statusIcon = { idle: 'radio-button-off', connecting: 'sync', connected: 'checkmark-circle', error: 'close-circle' };
  const statusLabel = { idle: 'Not connected', connecting: 'Connecting...', connected: 'Connected ✓', error: 'Connection failed' };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#0f172a" />
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>ESP32-CAM Connect</Text>
            <Text style={styles.subtitle}>Wearable Auto-Scanner</Text>
          </View>
        </View>

        {/* Device Illustration */}
        <View style={styles.deviceCard}>
          <View style={styles.deviceIllustration}>
            {/* Glasses Frame */}
            <View style={styles.glassesFrame}>
              <View style={styles.glassesBridge} />
              <View style={styles.glassesLeft}>
                <View style={styles.cameraMount}>
                  <Ionicons name="camera" size={14} color="#3b82f6" />
                </View>
              </View>
              <View style={styles.glassesRight} />
            </View>
            <Text style={styles.deviceLabel}>ESP32-CAM on glasses</Text>
          </View>
          <Text style={styles.deviceDesc}>
            Mount ESP32-CAM on glasses or collar. It auto-scans and recognizes ALL your objects continuously — no manual scanning needed!
          </Text>
          <View style={styles.featureRow}>
            {['Auto Scan', 'Offline Queue', 'All Objects', 'Free!'].map(f => (
              <View key={f} style={styles.featureChip}>
                <Ionicons name="checkmark" size={12} color="#22c55e" />
                <Text style={styles.featureText}>{f}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Connection Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Camera Settings</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>ESP32-CAM IP Address</Text>
            <View style={styles.inputRow}>
              <Ionicons name="wifi" size={18} color="#3b82f6" style={{ marginLeft: 14 }} />
              <TextInput
                style={styles.input}
                placeholder="e.g. 192.168.1.105"
                placeholderTextColor="#94a3b8"
                value={camIP}
                onChangeText={setCamIP}
                keyboardType="numeric"
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Room Camera is Mounted In</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roomScroll}>
              {ROOMS.map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.roomChip, roomLabel === r && styles.roomChipSel]}
                  onPress={() => setRoomLabel(r)}
                >
                  <Text style={[styles.roomChipText, roomLabel === r && { color: '#fff' }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>

        {/* Status */}
        <View style={[styles.statusCard, { borderColor: statusColor[status] + '40' }]}>
          <Ionicons name={statusIcon[status] as any} size={22} color={statusColor[status]} />
          <Text style={[styles.statusText, { color: statusColor[status] }]}>{statusLabel[status]}</Text>
          {status === 'connecting' && <ActivityIndicator size="small" color={statusColor[status]} />}
        </View>

        {lastResult && (
          <View style={styles.resultBanner}>
            <Ionicons name="sparkles" size={16} color="#8b5cf6" />
            <Text style={styles.resultText}>{lastResult}</Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.testBtn} onPress={testConnection}>
            <Ionicons name="pulse" size={20} color="#fff" />
            <Text style={styles.testBtnText}>Test Connection</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.captureBtn} onPress={captureSingle} disabled={status !== 'connected'}>
            <Ionicons name="camera" size={20} color="#fff" />
            <Text style={styles.captureBtnText}>Capture & Scan Now</Text>
          </TouchableOpacity>
        </View>

        {/* Arduino Setup Guide */}
        <View style={styles.guideCard}>
          <Text style={styles.guideTitle}>📋 ESP32-CAM Setup (One Time)</Text>
          <Text style={styles.guideStep}>1. Buy: ESP32-CAM (Rs. 900) + USB cable</Text>
          <Text style={styles.guideStep}>2. Install: Arduino IDE (free)</Text>
          <Text style={styles.guideStep}>3. Flash this firmware (30 mins):</Text>
          <View style={styles.codeBlock}>
            <Text style={styles.code}>{`#include <WiFi.h>\n#include <esp_camera.h>\n\nconst char* ssid = "YOUR_WIFI";\nconst char* pass = "YOUR_PASS";\n\nvoid setup() {\n  WiFi.begin(ssid, pass);\n  camera_init();\n  startCameraServer();\n}\nvoid loop() { delay(100); }`}</Text>
          </View>
          <Text style={styles.guideStep}>4. Note the IP shown in Serial Monitor</Text>
          <Text style={styles.guideStep}>5. Enter IP above and tap Test Connection!</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { padding: 20, paddingBottom: 50 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24 },
  backBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', elevation: 2 },
  title: { fontSize: 22, fontWeight: '900', color: '#0f172a' },
  subtitle: { fontSize: 13, color: '#64748b', fontWeight: '600' },

  deviceCard: { backgroundColor: '#0f172a', borderRadius: 28, padding: 24, marginBottom: 24 },
  deviceIllustration: { alignItems: 'center', marginBottom: 16 },
  glassesFrame: { flexDirection: 'row', alignItems: 'center', gap: 0, marginBottom: 8 },
  glassesBridge: { width: 20, height: 4, backgroundColor: '#3b82f6', borderRadius: 2 },
  glassesLeft: { width: 60, height: 36, borderRadius: 18, borderWidth: 3, borderColor: '#3b82f6', alignItems: 'flex-start', justifyContent: 'center', paddingLeft: 4 },
  glassesRight: { width: 60, height: 36, borderRadius: 18, borderWidth: 3, borderColor: '#3b82f6' },
  cameraMount: { width: 22, height: 22, borderRadius: 8, backgroundColor: '#1e293b', borderWidth: 1.5, borderColor: '#3b82f6', alignItems: 'center', justifyContent: 'center' },
  deviceLabel: { color: '#64748b', fontSize: 11, fontWeight: '700' },
  deviceDesc: { color: '#94a3b8', fontSize: 14, lineHeight: 22, marginBottom: 14 },
  featureRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  featureChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1e293b', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  featureText: { color: '#cbd5e1', fontSize: 12, fontWeight: '700' },

  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: '#0f172a', marginBottom: 14 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '800', color: '#475569', marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1.5, borderColor: '#e2e8f0' },
  input: { flex: 1, paddingVertical: 14, paddingHorizontal: 12, fontSize: 16, color: '#0f172a', fontWeight: '600' },
  roomScroll: { marginTop: 4 },
  roomChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#fff', marginRight: 8 },
  roomChipSel: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  roomChipText: { color: '#64748b', fontWeight: '700', fontSize: 13 },

  statusCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1.5 },
  statusText: { fontWeight: '800', fontSize: 14, flex: 1 },
  resultBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f3e8ff', borderRadius: 14, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#d8b4fe' },
  resultText: { color: '#7c3aed', fontWeight: '700', fontSize: 13, flex: 1 },

  actions: { gap: 12, marginBottom: 24 },
  testBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0f172a', borderRadius: 18, paddingVertical: 16 },
  testBtnText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  captureBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#3b82f6', borderRadius: 18, paddingVertical: 16 },
  captureBtnText: { color: '#fff', fontWeight: '900', fontSize: 16 },

  guideCard: { backgroundColor: '#fff', borderRadius: 24, padding: 20, gap: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  guideTitle: { fontSize: 16, fontWeight: '900', color: '#0f172a', marginBottom: 4 },
  guideStep: { fontSize: 14, color: '#475569', fontWeight: '600', lineHeight: 22 },
  codeBlock: { backgroundColor: '#0f172a', borderRadius: 12, padding: 14, marginVertical: 4 },
  code: { color: '#38bdf8', fontSize: 11, fontFamily: 'monospace', lineHeight: 18 },
});
