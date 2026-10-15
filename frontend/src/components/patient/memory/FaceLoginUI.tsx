import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, ScrollView, Alert, Modal, Animated
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Speech from 'expo-speech';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.80:5000';
const API = `${BASE_URL}/api/admin/behavior`;

export default function FaceLoginUI() {
  const [mode, setMode] = useState<'face' | 'id'>('face');
  const [regNumber, setRegNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  // Camera state for face scan
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollCode, setEnrollCode] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  
  // Auto-scan logic
  const isScanningRef = useRef(false);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for auto-scanning
  useEffect(() => {
    if (mode === 'face') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
    }
  }, [mode]);

  useEffect(() => {
    if (mode === 'face' && permission?.granted && !showEnrollModal) {
      startAutoScan();
    } else {
      stopAutoScan();
    }
    return () => stopAutoScan();
  }, [mode, permission, showEnrollModal]);

  const startAutoScan = () => {
    if (scanIntervalRef.current) return;
    scanIntervalRef.current = setInterval(() => {
      if (!isScanningRef.current && cameraRef.current) {
        performSilentScan();
      }
    }, 2000); // Poll every 2 seconds
  };

  const stopAutoScan = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
  };

  const performSilentScan = async () => {
    if (isScanningRef.current) return;
    isScanningRef.current = true;
    
    try {
      const snap = await cameraRef.current?.takePictureAsync({ quality: 0.5, base64: false }); // lower quality for fast scan
      if (!snap?.uri) {
        isScanningRef.current = false;
        return;
      }

      const form = new FormData();
      form.append('file', { uri: snap.uri, name: 'login.jpg', type: 'image/jpeg' } as any);

      const res = await axios.post(`${API}/face-login`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 5000, // fast timeout
        validateStatus: (status) => status >= 200 && status < 500,
      });

      if (res.data.success && res.data.patient) {
        stopAutoScan();
        setLoading(true); // show loader on UI to indicate transition
        await AsyncStorage.setItem('patient', JSON.stringify(res.data.patient));
        Speech.speak(`Welcome back, ${res.data.patient.firstName}`, { language: 'en-US' });
        router.replace('/patient');
      } else {
        isScanningRef.current = false; // try again
      }
    } catch (err: any) {
      // Backend returns 404 if not found, just silently try again
      isScanningRef.current = false;
    }
  };

  const handleIdLogin = async () => {
    const code = regNumber.trim().toUpperCase();
    if (!code) {
      setError('Please enter your Registration Number');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(`${API}/mobile-login`, { registrationNumber: code }, { timeout: 8000 });
      if (res.data.success) {
        await AsyncStorage.setItem('patient', JSON.stringify(res.data.patient));
        Speech.speak(`Welcome back, ${res.data.patient.firstName}`, { language: 'en-US' });
        router.replace('/patient');
      } else {
        setError(res.data.message || 'Login failed. Please try again.');
      }
    } catch (err: any) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEnrollFace = async () => {
    const code = enrollCode.trim().toUpperCase();
    if (!code || !cameraRef.current) {
      Alert.alert('Notice', 'Please enter your registration number and look at the camera.');
      return;
    }
    setEnrolling(true);
    try {
      const snap = await cameraRef.current.takePictureAsync({ quality: 1, base64: false });
      if (!snap?.uri) throw new Error('Camera capture failed.');

      const form = new FormData();
      form.append('file', { uri: snap.uri, name: 'enroll.jpg', type: 'image/jpeg' } as any);
      form.append('customerCode', code);

      const res = await axios.post(`${API}/register-face`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 25000,
      });

      if (res.data.success) {
        Speech.speak('Your face has been registered! You can now log in with your face.', { language: 'en-US' });
        Alert.alert('Success', 'Your face is registered! You can now log in instantly by scanning your face.');
        setShowEnrollModal(false);
        setEnrollCode('');
      }
    } catch (err: any) {
      Alert.alert('Registration Failed', err.response?.data?.error || err.message || 'Could not register face.');
    } finally {
      setEnrolling(false);
    }
  };

  const handleError = (err: any, isFace = false) => {
    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      setError(`⏱ Connection timed out.\nMake sure the backend is running on ${BASE_URL}`);
    } else if (err.message?.includes('Network Error') || err.code === 'ERR_NETWORK') {
      setError(`📡 Network Error — Cannot reach ${BASE_URL}\n\nCheck WiFi and verify backend is running.`);
    } else if (err.response?.status === 404) {
      setError(isFace 
        ? '❌ Face not recognized or not registered yet.\nTap "Register Face" below or use ID Number.' 
        : '❌ Patient not registered.\nCheck your Registration Number.');
    } else {
      setError('⚠️ ' + (err.response?.data?.message || err.message || 'Unknown error'));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        
        {/* Header Navigation */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#0f172a" />
          </TouchableOpacity>
        </View>

        {/* Logo */}
        <View style={styles.logoSection}>
          <View style={styles.logoCircle}>
            <Ionicons name="shield-checkmark" size={44} color="#fff" />
          </View>
          <Text style={styles.appName}>MemoCare</Text>
          <Text style={styles.tagline}>Personalized Care Access</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabBtn, mode === 'face' && styles.tabBtnActive]}
              onPress={() => { setMode('face'); setError(''); }}
            >
              <Ionicons name="scan-outline" size={18} color={mode === 'face' ? '#fff' : '#64748b'} />
              <Text style={[styles.tabText, mode === 'face' && styles.tabTextActive]}>Face Scan</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, mode === 'id' && styles.tabBtnActive]}
              onPress={() => { setMode('id'); setError(''); }}
            >
              <Ionicons name="keypad-outline" size={18} color={mode === 'id' ? '#fff' : '#64748b'} />
              <Text style={[styles.tabText, mode === 'id' && styles.tabTextActive]}>ID Number</Text>
            </TouchableOpacity>
          </View>

          {mode === 'face' ? (
            <View style={styles.faceTabContainer}>
              <Text style={styles.cardSubtitle}>Position your face clearly within the large frame</Text>

              {permission?.granted ? (
                <View style={styles.cameraWrapper}>
                  <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="front" mute autoFocus="on" />
                  <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, {alignItems: 'center', justifyContent: 'center'}]}>
                    <Animated.View style={[styles.faceOval, { transform: [{ scale: pulseAnim }] }]} />
                  </View>
                </View>
              ) : (
                <View style={styles.noPermBox}>
                  <Ionicons name="camera-outline" size={48} color="#94a3b8" />
                  <Text style={styles.noPermText}>Camera permission is needed for face scan</Text>
                  <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
                    <Text style={styles.permBtnText}>Allow Camera</Text>
                  </TouchableOpacity>
                </View>
              )}

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <View style={styles.autoScanContainer}>
                {loading ? (
                  <>
                    <ActivityIndicator color="#0f172a" size="large" />
                    <Text style={styles.autoScanText}>Logging you in...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="scan" size={28} color="#3b82f6" />
                    <Text style={styles.autoScanText}>Looking for your face...</Text>
                  </>
                )}
              </View>

              <TouchableOpacity onPress={() => setShowEnrollModal(true)} style={styles.enrollLink}>
                <Text style={styles.enrollText}>First time? Tap here to register your face</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.idTabContainer}>
              <Text style={styles.cardSubtitle}>Enter your Registration Number to continue</Text>

              <View style={styles.inputGroup}>
                <Ionicons name="id-card-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. PAT-2026-050"
                  placeholderTextColor="#94a3b8"
                  value={regNumber}
                  onChangeText={t => { setRegNumber(t); setError(''); }}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="go"
                  onSubmitEditing={handleIdLogin}
                />
              </View>

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
                onPress={handleIdLogin}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.loginBtnText}>Login with ID</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
        <Text style={styles.hint}>
          Secure Authentication System.{'\n'}Contact support if you need assistance.
        </Text>
      </ScrollView>

      {/* Enroll Modal */}
      <Modal visible={showEnrollModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Register Face</Text>
            <Text style={styles.modalSub}>
              Enter your ID and position your face in the frame.
            </Text>
            <View style={styles.inputGroup}>
              <Ionicons name="keypad-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Registration Number"
                placeholderTextColor="#94a3b8"
                value={enrollCode}
                onChangeText={setEnrollCode}
                autoCapitalize="characters"
              />
            </View>
            {permission?.granted ? (
              <View style={styles.cameraWrapperSmall}>
                <CameraView ref={cameraRef} style={styles.camera} facing="front" autoFocus="on" />
              </View>
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowEnrollModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, enrolling && styles.loginBtnDisabled]}
                onPress={handleEnrollFace}
                disabled={enrolling}
              >
                {enrolling ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmText}>Register Face</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { flexGrow: 1, padding: 24, paddingTop: 10 },
  headerRow: { flexDirection: 'row', marginBottom: 10 },
  backButton: { 
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 
  },
  logoSection: { alignItems: 'center', marginBottom: 24 },
  logoCircle: {
    width: 86, height: 86, borderRadius: 28,
    backgroundColor: '#0f172a', alignItems: 'center',
    justifyContent: 'center', marginBottom: 14,
    shadowColor: '#0f172a', shadowOpacity: 0.25, shadowRadius: 18, elevation: 10
  },
  appName: { fontSize: 32, fontWeight: '900', color: '#0f172a', letterSpacing: -0.5 },
  tagline: { fontSize: 15, color: '#64748b', fontWeight: '500', marginTop: 4 },

  card: {
    backgroundColor: '#fff', borderRadius: 28, padding: 24,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 20, elevation: 8
  },
  tabBar: {
    flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 16,
    padding: 6, marginBottom: 24
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 12, gap: 8
  },
  tabBtnActive: { backgroundColor: '#0f172a', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 },
  tabText: { color: '#64748b', fontWeight: '700', fontSize: 14 },
  tabTextActive: { color: '#fff' },

  faceTabContainer: { width: '100%' },
  idTabContainer: { width: '100%' },
  cardSubtitle: { fontSize: 15, color: '#475569', fontWeight: '600', marginBottom: 20, textAlign: 'center' },

  cameraWrapper: {
    width: '100%', height: 450, borderRadius: 28, overflow: 'hidden', // Super large container
    backgroundColor: '#f1f5f9', marginBottom: 24, borderWidth: 2, borderColor: '#e2e8f0'
  },
  cameraWrapperSmall: {
    width: '100%', height: 220, borderRadius: 16, overflow: 'hidden',
    backgroundColor: '#f1f5f9', marginVertical: 16, borderWidth: 2, borderColor: '#e2e8f0'
  },
  camera: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  faceOval: {
    width: 260, height: 350, borderRadius: 130, // Much larger oval
    borderWidth: 4, borderColor: 'rgba(255, 255, 255, 0.9)',
    backgroundColor: 'transparent'
  },

  noPermBox: {
    height: 450, borderRadius: 28, backgroundColor: '#f1f5f9',
    alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14, marginBottom: 24, borderWidth: 2, borderColor: '#e2e8f0'
  },
  noPermText: { color: '#64748b', fontSize: 15, textAlign: 'center', fontWeight: '600' },
  permBtn: { backgroundColor: '#0f172a', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  permBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  inputGroup: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f8fafc', borderRadius: 16,
    borderWidth: 1.5, borderColor: '#e2e8f0', marginBottom: 20, paddingHorizontal: 16
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, paddingVertical: 18, fontSize: 17, color: '#0f172a', fontWeight: '700' },

  errorBox: {
    backgroundColor: '#fef2f2', borderRadius: 16, padding: 16,
    marginBottom: 20, borderWidth: 1.5, borderColor: '#fecaca'
  },
  errorText: { color: '#b91c1c', fontSize: 14, fontWeight: '600', lineHeight: 22 },

  autoScanContainer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingVertical: 16, marginBottom: 18,
    backgroundColor: '#f1f5f9', borderRadius: 18, borderWidth: 1.5, borderColor: '#e2e8f0'
  },
  autoScanText: { color: '#0f172a', fontWeight: '800', fontSize: 16 },

  loginBtn: {
    backgroundColor: '#0f172a', borderRadius: 18, paddingVertical: 20,
    alignItems: 'center', marginBottom: 18,
    shadowColor: '#0f172a', shadowOpacity: 0.25, shadowRadius: 12, elevation: 8
  },
  loginBtnDisabled: { opacity: 0.5 },
  loginBtnText: { color: '#fff', fontWeight: '900', fontSize: 17 },

  enrollLink: { alignItems: 'center', paddingVertical: 10 },
  enrollText: { color: '#3b82f6', fontSize: 15, fontWeight: '700' },

  hint: { textAlign: 'center', color: '#94a3b8', fontSize: 14, marginTop: 32, lineHeight: 22, fontWeight: '500' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.75)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#fff', borderRadius: 32, padding: 28, elevation: 12 },
  modalTitle: { color: '#0f172a', fontSize: 24, fontWeight: '900', marginBottom: 8 },
  modalSub: { color: '#64748b', fontSize: 15, marginBottom: 24, lineHeight: 22, fontWeight: '500' },
  modalActions: { flexDirection: 'row', gap: 14, marginTop: 12 },
  cancelBtn: { flex: 1, padding: 18, borderRadius: 18, backgroundColor: '#f1f5f9', alignItems: 'center' },
  cancelText: { color: '#64748b', fontWeight: '800', fontSize: 16 },
  confirmBtn: { flex: 1, padding: 18, borderRadius: 18, backgroundColor: '#0f172a', alignItems: 'center' },
  confirmText: { color: '#fff', fontWeight: '900', fontSize: 16 }
});
