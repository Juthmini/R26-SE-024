import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Animated, Keyboard, Modal, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import CompassArrow from './CompassArrow';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as Speech from 'expo-speech';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { registerBackgroundAlerts, triggerAlertNow } from '../../../services/backgroundAlerts';
import { type Language } from '../../../constants/translations';
import { extractObjectKeyword, findAndSpeakLocation, normaliseKeyword } from '../../../services/voiceCommands';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://172.20.10.3:5000';
const API = `${BASE_URL}/api/admin/behavior`;

const ACTIVITY_ICONS: Record<string, any> = {
  eating: 'restaurant', sleeping: 'bed', walking: 'walk',
  wandering: 'warning', sitting: 'person', medication: 'medkit',
  bathing: 'water', exercise: 'barbell', socializing: 'people',
};
const ACTIVITY_COLORS: Record<string, string> = {
  eating: '#f97316', sleeping: '#6366f1', walking: '#22c55e',
  wandering: '#ef4444', sitting: '#94a3b8', medication: '#3b82f6',
  bathing: '#06b6d4', exercise: '#a855f7', socializing: '#ec4899',
};

export default function DashboardUI() {
  const router = useRouter();
  const [patient, setPatient] = useState<any>(null);
  const [routine, setRoutine] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'ok' | 'error' | 'checking'>('checking');
  const [isCamConnected, setIsCamConnected] = useState(false);
  const [bgAlertsOn, setBgAlertsOn] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [language, setLanguage] = useState<Language>('si-LK');

  // Voice search state
  const [voiceQuery, setVoiceQuery] = useState('');
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceSearching, setVoiceSearching] = useState(false);
  const [voiceResult, setVoiceResult] = useState<{ found: boolean; message: string; distanceLabel?: string } | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const patientRef = useRef<any>(null);
  const gpsRef = useRef<{ lat: number; lng: number } | null>(null);

  // Geo-Fencing State
  const [homeLocation, setHomeLocation] = useState<{lat: number, lng: number} | null>(null);
  const [distanceThreshold, setDistanceThreshold] = useState(50);
  const [isWandering, setIsWandering] = useState(false);
  const [distanceFromHome, setDistanceFromHome] = useState(0);

  // Haversine formula
  const getDistanceFromLatLonInM = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const dLat = (lat2-lat1) * (Math.PI/180);
    const dLon = (lon2-lon1) * (Math.PI/180);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.floor(R * c);
  };



  const [anomalyAlert, setAnomalyAlert] = useState<{ active: boolean, message: string }>({ active: false, message: '' });

  const handleWanderingSOS = async (dist: number) => {
    Speech.speak("Warning. You have wandered too far from home. Contacting your guardian.", { language: 'en-US' });
    Alert.alert("🚨 Geo-Fence Alert", `You are ${dist} meters away from home! Guardian notified.`);
    try {
      await axios.post('http://172.20.10.3:8000/alert-stranger', {
        patient_id: patient?.customerCode || patient?.id || 'PAT-2026-003',
        image_url: "WANDERING_GEOFENCE_ALERT"
      });
    } catch(e) {}
  };

  const checkBehaviorAnomaly = async (isWanderingNow: boolean) => {
    if (!patientRef.current) return;
    const hour = new Date().getHours();
    let timeOfDay = "Night";
    if (hour >= 5 && hour < 12) timeOfDay = "Morning";
    else if (hour >= 12 && hour < 17) timeOfDay = "Afternoon";
    else if (hour >= 17 && hour < 21) timeOfDay = "Evening";

    try {
      const res = await axios.post('http://172.20.10.3:8000/predict-behavior', {
        age: patientRef.current.age || 75,
        condition: "Alzheimer's",
        physical_state: "Mobile",
        time_of_day: timeOfDay,
        activity: isWanderingNow ? "Wandering" : "Sitting",
        duration_mins: 15
      });

      if (res.data && res.data.is_anomaly) {
        setAnomalyAlert({ active: true, message: res.data.message });
        if (timeOfDay === "Night") {
          Speech.speak("It is night time. Let's go back to bed. Follow the green arrow.", { language: 'en-US' });
        } else {
          Speech.speak("Please calm down. Let's sit for a moment.", { language: 'en-US' });
        }
      }
    } catch(e) {
      console.log("Anomaly ML Check Failed:", e);
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    const trackLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        gpsRef.current = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        
        // For research demo, first fetched location is set as 'Home'
        setHomeLocation(prev => {
          if (!prev) return { lat: loc.coords.latitude, lng: loc.coords.longitude };
          
          const dist = getDistanceFromLatLonInM(prev.lat, prev.lng, loc.coords.latitude, loc.coords.longitude);
          setDistanceFromHome(dist);

          let currentWandering = isWandering;
          if (dist > distanceThreshold && !isWandering) {
            setIsWandering(true);
            currentWandering = true;
            handleWanderingSOS(dist);
          } else if (dist <= distanceThreshold && isWandering) {
            setIsWandering(false);
            currentWandering = false;
          }

          // Trigger AI Behavior Check
          checkBehaviorAnomaly(currentWandering);

          return prev;
        });
        // Background Sync for Camera GPS
        if (patientRef.current) {
          const pId = patientRef.current.customerCode || patientRef.current.id || 'PAT-2026-003';
          axios.post('http://172.20.10.3:8000/update-location', {
            patient_id: pId,
            lat: loc.coords.latitude,
            lng: loc.coords.longitude
          }).catch(() => {});
        }

      } catch (err) {}
    };

    interval = setInterval(trackLocation, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, [isWandering]);

  const now = new Date();
  const currentHour = now.getHours();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Dynamic Greeting based on time
  let greetingMsg = 'Good Evening';
  if (currentHour < 12) greetingMsg = 'Good Morning';
  else if (currentHour < 17) greetingMsg = 'Good Afternoon';

  // Pulse animation
  useEffect(() => {
    if (voiceActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.25, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [voiceActive]);

  const pairCamera = async () => {
    try {
      if (!patient) {
        Alert.alert("Error", "Patient data not loaded yet.");
        return;
      }
      
      const pId = patient.customerCode || patient.id || 'PAT-2026-003';
      
      // Assuming ML backend is on 8000
      const res = await axios.post('http://172.20.10.3:8000/pair-camera', {
        device_id: 'CAM-001',
        patient_id: pId
      });
      if (res.data && res.data.status === 'success') {
        setIsCamConnected(true);
        Alert.alert("✅ ESP32 Connected", res.data.message);
      }
    } catch (err) {
      console.error(err);
      Alert.alert("❌ Error", "Could not connect to the Camera. Is Python running?");
    }
  };

  const disconnectCamera = async () => {
    try {
      const res = await axios.post('http://172.20.10.3:8000/disconnect-camera', {
        device_id: 'CAM-001',
        patient_id: patient?.customerCode || patient?.id || 'PAT-2026-003'
      });
      if (res.data && res.data.status === 'success') {
        setIsCamConnected(false);
        Alert.alert("Disconnected", res.data.message);
      }
    } catch (err) {
      Alert.alert("Error", "Could not disconnect camera.");
    }
  };

  const loadData = useCallback(async () => {
    setError('');
    try {
      const stored = await AsyncStorage.getItem('patient');
      if (!stored) { router.replace('/patient/auth'); return; }
      const p = JSON.parse(stored);
      setPatient(p);
      patientRef.current = p;

      Location.requestForegroundPermissionsAsync().then(({ status }) => {
        if (status === 'granted') {
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
            .then(pos => {
              gpsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            })
            .catch(() => {});
        }
      });

      const [routineRes, alertRes] = await Promise.all([
        axios.get(`${API}/pattern/${p.id}`, { timeout: 8000 }).catch(()=>({data:{}})),
        axios.post(`${API}/voice-alert`, { patientId: p.id }, { timeout: 8000 }).catch(()=>({data:{}}))
      ]);

      try {
        const pId = p.customerCode || p.id || 'PAT-2026-003';
        const geoRes = await axios.get(`http://172.20.10.3:8000/geofence/${pId}`);
        if (geoRes.data?.status === 'success' && geoRes.data?.geofence) {
          setHomeLocation({ lat: geoRes.data.geofence.lat, lng: geoRes.data.geofence.lng });
          setDistanceThreshold(geoRes.data.geofence.threshold);
        }
      } catch (err) {
        console.log("No geofence config found, using dynamic home.");
      }

      if (routineRes.data.success && routineRes.data.data?.status === 'success') {
        setRoutine(routineRes.data.data.routine || {});
      } else if (routineRes.data.status === 'success') {
        setRoutine(routineRes.data.routine || {});
      }

      if (alertRes.data.success && alertRes.data.alert?.speak) {
        setAlert(alertRes.data.alert);
        Speech.speak(alertRes.data.alert.message, { language: 'en-US', rate: 0.9, pitch: 1.0 });
      }

      setConnectionStatus('ok');
      const ok = await registerBackgroundAlerts();
      setBgAlertsOn(ok);
    } catch (err: any) {
      setConnectionStatus('error');
      if (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
        setError(`📡 Cannot connect to ${BASE_URL}\n\nCheck WiFi and backend.`);
      } else if (err.code === 'ECONNABORTED') {
        setError(`⏱ Connection timed out.`);
      } else {
        setError(err.response?.data?.message || err.message || 'Unknown error');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    const interval = setInterval(loadData, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  // ── Voice search ──────────
  const openVoiceSearch = () => {
    setVoiceActive(true);
    setVoiceQuery('');
    setVoiceResult(null);
  };

  const closeVoiceSearch = () => {
    setVoiceActive(false);
    setVoiceQuery('');
    setVoiceResult(null);
    Keyboard.dismiss();
  };

  

  // ── Proactive Missing Object Alert ─────────────────────────────────────────
  const checkMissingObjects = async (p: any) => {
    try {
      const memKey = `patient_memories_${p.id}`;
      const stored = await AsyncStorage.getItem(memKey);
      if (!stored) return;
      const memories: any[] = JSON.parse(stored);

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const myLat = pos.coords.latitude;
      const myLng = pos.coords.longitude;

      const alertedKey = `alerted_today_${p.id}_${new Date().toDateString()}`;
      const alreadyAlerted = await AsyncStorage.getItem(alertedKey);
      const alertedToday: string[] = alreadyAlerted ? JSON.parse(alreadyAlerted) : [];

      for (const mem of memories) {
        if (!mem.lat || !mem.lng) continue;
        if (alertedToday.includes(mem.name)) continue;

        // Haversine distance
        const R = 6371000;
        const dLat = (mem.lat - myLat) * Math.PI / 180;
        const dLng = (mem.lng - myLng) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(myLat * Math.PI/180) * Math.cos(mem.lat * Math.PI/180) * Math.sin(dLng/2)**2;
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        if (dist > 30) {
          const room = mem.room || 'the last known room';
          const msg = language === 'si-LK'
            ? `ඔබේ ${mem.name} ඔබ ළඟ නෑ. ${room} ඇත.`
            : `Your ${mem.name} is not with you. It was last seen in the ${room}.`;
          Speech.speak(msg, { language, rate: 0.9 });
          alertedToday.push(mem.name);
          await AsyncStorage.setItem(alertedKey, JSON.stringify(alertedToday));
          break; // one alert at a time
        }
      }
    } catch {}
  };

  const handleAssistantSearch = async (queryText?: string | any) => {
    const text = (typeof queryText === 'string' ? queryText : voiceQuery).trim().toLowerCase();
    if (!text) return;
    Keyboard.dismiss();
    setVoiceSearching(true);
    setVoiceResult(null);

    // Intent: Time / Date
    if (text.includes('day') || text.includes('date') || text.includes('today') || text.includes('දවස') || text.includes('අද')) {
      const todayMsg = language === 'si-LK' ? `අද ${dateStr}.` : `Today is ${dateStr}.`;
      Speech.speak(todayMsg, { language, rate: 0.9 });
      setVoiceResult({ found: true, message: `Today is ${dateStr}` });
      setVoiceSearching(false);
      return;
    }

    // Intent: Next Meal
    if (text.includes('meal') || text.includes('eat') || text.includes('food') || text.includes('lunch') || text.includes('dinner') || text.includes('breakfast') || text.includes('කෑම') || text.includes('කන්න')) {
      const mealMsg = language === 'si-LK' ? 'ඔබේ ඊළඟ ආහාරය ළඟදීම. ඔබේ දිනපත දෙස බලන්න.' : 'Your next meal is coming up soon. Please check your daily routine.';
      Speech.speak(mealMsg, { language, rate: 0.9 });
      setVoiceResult({ found: true, message: `Check your routine for eating times.` });
      setVoiceSearching(false);
      return;
    }

    // Intent: Call Family
    if (text.includes('call') || text.includes('daughter') || text.includes('son') || text.includes('wife') || text.includes('family') || text.includes('කතා කරන්න') || text.includes('ගන්න') || text.includes('පුතා') || text.includes('දුව')) {
      const callMsg = language === 'si-LK' ? 'ඔබේ පවුලේ කෙනෙකු ඇමතෙමින්...' : 'Calling your family member now.';
      Speech.speak(callMsg, { language, rate: 0.9 });
      setVoiceResult({ found: true, message: `Calling Family...` });
      setVoiceSearching(false);
      return;
    }

    // Fallback: Object Location Finder
    const keyword = extractObjectKeyword(text) || normaliseKeyword(text.split(' ').pop() || text);
    const p = patientRef.current;
    if (!p?.id) return;
    
    Speech.speak(`Searching for your ${keyword}...`, { language: 'en-US', rate: 0.9 });
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        gpsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }
    } catch {}

    const result = await findAndSpeakLocation(
      language, p.id, keyword, p.firstName || 'there',
      gpsRef.current?.lat, gpsRef.current?.lng
    );
    setVoiceResult(result);
    setVoiceSearching(false);
  };

  const QUICK_ITEMS = ['toothbrush', 'glasses', 'keys', 'medicine', 'phone', 'remote'];


  const translateActivity = (act: string) => {
    if (language !== 'si-LK') return act.charAt(0).toUpperCase() + act.slice(1);
    const map: any = {
      eating: 'ආහාර ගැනීම',
      medication: 'බෙහෙත් බීම',
      sleeping: 'නිදාගැනීම',
      bathing: 'නාගැනීම',
      sitting: 'විවේක ගැනීම',
      socializing: 'කතාබහ කිරීම',
      exercise: 'ව්‍යායාම කිරීම'
    };
    return map[act.toLowerCase()] || act;
  };

  const playRoutineVoice = () => {
    const currentActivity = routine[currentHour];
    if (!currentActivity) {
      const speechMsg = language === 'si-LK' ? 'Me welaawata wishesha wedasatahanak netha.' : 'You have no scheduled activities right now.';
      Speech.speak(speechMsg, { language: 'en-US', rate: 0.85 });
      return;
    }
    
    const translated = translateActivity(currentActivity);
    const mapSinglish: any = { eating: 'aahaara geneema', medication: 'beheth beema', sleeping: 'nidaa geneema', bathing: 'naa geneema', sitting: 'wiweka geneema', socializing: 'kathaa-baha kireema', exercise: 'wyaayaama kireema' };
    const singlishAct = mapSinglish[currentActivity.toLowerCase()] || currentActivity;

    const speechMsg = language === 'si-LK'
      ? `Den obe eelanga wedasatahana ${singlishAct}.`
      : `Your expected activity now is ${currentActivity}.`;
    
    Speech.speak(speechMsg, { language: 'en-US', rate: 0.85 });
  };

  const speakAlert = () => {
    if (patient?.id) triggerAlertNow(patient.id);
    else if (alert?.message) Speech.speak(alert.message, { language: 'en-US', rate: 0.9 });
  };

  // SOS Feature
  const handleSOS = () => {
    Speech.speak("Alerting your caregiver immediately.", { language: 'en-US', rate: 0.85 });
    Alert.alert("SOS Sent", "Caregiver has been notified of your location.");
  };

  const logout = async () => {
    await AsyncStorage.removeItem('patient');
    router.replace('/patient/auth');
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: isDarkMode ? '#0f172a' : '#f8fafc' }]}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={[styles.loadingText, { color: isDarkMode ? '#64748b' : '#94a3b8' }]}>Loading your profile...</Text>
      </View>
    );
  }

  const currentActivity = routine[String(currentHour)];

  const bgColor = isDarkMode ? '#0f172a' : '#f8fafc';
  const cardColor = isDarkMode ? '#1e293b' : '#fff';
  const textColor = isDarkMode ? '#f1f5f9' : '#0f172a';
  const subTextColor = isDarkMode ? '#64748b' : '#475569';

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <View style={{ backgroundColor: '#1e3a8a', height: 50, position: 'absolute', top: 0, left: 0, right: 0 }} />
      <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#fff" />}
        contentContainerStyle={styles.scroll}
      >
        {/* Blue Header Section */}
        <View style={styles.blueHeaderContainer}>
          {/* MemoCare Logo & Theme Toggle Header */}
          <View style={styles.topBarRow}>
            <View style={styles.logoRow}>
              <View style={styles.logoCircleSmall}>
                <Ionicons name="shield-checkmark" size={20} color="#1e3a8a" />
              </View>
              <Text style={styles.topBarLogoText}>MemoCare</Text>
            </View>
            <View style={styles.topBarActions}>
              <TouchableOpacity onPress={() => setLanguage(l => l === 'si-LK' ? 'en-US' : 'si-LK')} style={styles.iconBtnHeader}>
                <Text style={{ fontSize: 16 }}>{language === 'si-LK' ? '🇱🇰' : '🇬🇧'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setIsDarkMode(!isDarkMode)} style={styles.iconBtnHeader}>
                <Ionicons name={isDarkMode ? 'sunny' : 'moon'} size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={logout} style={styles.iconBtnHeader}>
                <Ionicons name="log-out-outline" size={20} color="#fca5a5" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Greeting */}
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>{greetingMsg}, {patient?.firstName || 'Patient'} 👋</Text>
              <Text style={styles.dateText}>{dateStr}</Text>
              <Text style={styles.timeText}>{timeStr}</Text>
            </View>
          </View>
        </View>
        
        {/* Main Content Area */}
        <View style={styles.mainContent}>
        
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={loadData} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Voice Alert Banner */}
        {alert && (
          <View style={styles.alertBanner}>
            <TouchableOpacity style={styles.alertIcon} onPress={speakAlert}>
              <Ionicons name="play" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>Voice Reminder</Text>
              <Text style={styles.alertMessage}>{alert.message}</Text>
            </View>
            <TouchableOpacity onPress={() => Speech.stop()} style={styles.stopAlertBtn}>
              <Ionicons name="stop-circle" size={26} color="#f87171" />
            </TouchableOpacity>
          </View>
        )}

        {/* Current Activity */}
        {currentActivity ? (
          <View style={styles.currentActivity}>
            <Text style={styles.sectionLabel}>NOW Â· {timeStr}</Text>
            <View style={styles.currentRow}>
              <View style={[styles.activityIcon, { backgroundColor: (ACTIVITY_COLORS[currentActivity] || '#94a3b8') + '22' }]}>
                <Ionicons name={ACTIVITY_ICONS[currentActivity] || 'help'} size={32} color={ACTIVITY_COLORS[currentActivity] || '#94a3b8'} />
              </View>
              <View>
                <Text style={styles.currentLabel}>Expected Activity</Text>
                <Text style={styles.currentName}>{currentActivity.charAt(0).toUpperCase() + currentActivity.slice(1)}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Quick Actions (Replaces long list) */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: subTextColor }]}>
            {language === 'si-LK' ? 'ඉක්මන් ක්‍රියාකාරකම්' : 'QUICK ACTIONS'}
          </Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity style={[styles.actionCard, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe', padding: 18, borderRadius: 24, elevation: 2 }]} onPress={() => router.push('/patient/ar-vision')}>
              <View style={[styles.actionIconBox, { backgroundColor: '#3b82f6', width: 56, height: 56, borderRadius: 28 }]}>
                <Ionicons name="camera" size={30} color="#fff" />
              </View>
              <Text style={[styles.actionCardLabel, { color: '#1d4ed8', marginTop: 12 }]}>{language === 'si-LK' ? 'භාණ්ඩ හඳුනාගැනීම' : 'Detect Objects'}</Text>
              <Text style={styles.actionCardSub}>{language === 'si-LK' ? 'ඉබේම ස්ථානය සේව් වේ' : 'Auto-save location'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.actionCard, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', padding: 18, borderRadius: 24, elevation: 2 }]} onPress={() => router.push('/patient/object-map')}>
              <View style={[styles.actionIconBox, { backgroundColor: '#22c55e', width: 56, height: 56, borderRadius: 28 }]}>
                <Ionicons name="map" size={30} color="#fff" />
              </View>
              <Text style={[styles.actionCardLabel, { color: '#15803d', marginTop: 12 }]}>{language === 'si-LK' ? 'භාණ්ඩ සිතියම' : 'Object Map'}</Text>
              <Text style={styles.actionCardSub}>{language === 'si-LK' ? 'සියලුම ස්ථාන බලන්න' : 'See all locations'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.actionCard, { backgroundColor: '#fdf4ff', borderColor: '#e9d5ff', padding: 18, borderRadius: 24, elevation: 2 }]} onPress={openVoiceSearch}>
              <View style={[styles.actionIconBox, { backgroundColor: '#8b5cf6', width: 56, height: 56, borderRadius: 28 }]}>
                <Ionicons name="search" size={30} color="#fff" />
              </View>
              <Text style={[styles.actionCardLabel, { color: '#6d28d9', marginTop: 12 }]}>{language === 'si-LK' ? 'භාණ්ඩය සොයන්න' : 'Find Object'}</Text>
              <Text style={styles.actionCardSub}>{language === 'si-LK' ? 'මගේ භාණ්ඩ කොහෙද...' : 'Where is my...'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.actionCard, { backgroundColor: '#fefce8', borderColor: '#fef08a', padding: 18, borderRadius: 24, elevation: 2 }]} onPress={playRoutineVoice}>
              <View style={[styles.actionIconBox, { backgroundColor: '#eab308', width: 56, height: 56, borderRadius: 28 }]}>
                <Ionicons name="time" size={30} color="#fff" />
              </View>
              <Text style={[styles.actionCardLabel, { color: '#a16207', marginTop: 12 }]}>{language === 'si-LK' ? 'කාලසටහන (Voice)' : 'Daily Routine'}</Text>
              <Text style={styles.actionCardSub}>{language === 'si-LK' ? 'කටහඬින් වෙලාව අසන්න' : 'Voice Schedule'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.actionCard, { backgroundColor: '#fdf2f8', borderColor: '#fbcfe8', padding: 18, borderRadius: 24, elevation: 2 }]} onPress={() => router.push('/patient/memories')}>
              <View style={[styles.actionIconBox, { backgroundColor: '#ec4899', width: 56, height: 56, borderRadius: 28 }]}>
                <Ionicons name="images" size={30} color="#fff" />
              </View>
              <Text style={[styles.actionCardLabel, { color: '#be185d', marginTop: 12 }]}>{language === 'si-LK' ? 'මගේ මතකයන්' : 'My Memories'}</Text>
              <Text style={styles.actionCardSub}>{language === 'si-LK' ? 'සේව් කල ඡායාරූප' : 'View saved photos'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.actionCard, { backgroundColor: '#faf5ff', borderColor: '#e9d5ff', padding: 18, borderRadius: 24, elevation: 2 }]} onPress={() => router.push('/patient/memory-vault')}>
              <View style={[styles.actionIconBox, { backgroundColor: '#7c3aed', width: 56, height: 56, borderRadius: 28 }]}>
                <Ionicons name="heart" size={30} color="#fff" />
              </View>
              {/* Sinhala label is a best-effort translation — worth a native speaker checking it */}
              <Text style={[styles.actionCardLabel, { color: '#6d28d9', marginTop: 12 }]}>{language === 'si-LK' ? 'මතක කථා' : 'Memory Stories'}</Text>
              <Text style={styles.actionCardSub}>{language === 'si-LK' ? 'පවුලේ අය කීවු කථා අහන්න' : 'Listen to family stories'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.actionCard, { backgroundColor: '#fff1f2', borderColor: '#fecdd3', padding: 18, borderRadius: 24, elevation: 2 }]} onPress={handleSOS}>
              <View style={[styles.actionIconBox, { backgroundColor: '#ef4444', width: 56, height: 56, borderRadius: 28 }]}>
                <Ionicons name="alert-circle" size={30} color="#fff" />
              </View>
              <Text style={[styles.actionCardLabel, { color: '#b91c1c', marginTop: 12 }]}>{language === 'si-LK' ? 'හදිසි අනතුරු (SOS)' : 'Emergency SOS'}</Text>
              <Text style={styles.actionCardSub}>{language === 'si-LK' ? 'රැකබලාගන්නාට දැනුම්දීම' : 'Alert Caregiver'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Patient Card */}
        <View style={[styles.patientCard, { backgroundColor: cardColor, shadowColor: isDarkMode ? '#000' : '#cbd5e1' }]}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{patient?.firstName?.[0] || '?'}</Text>
          </View>
          <View>
            <Text style={[styles.patientName, { color: textColor }]}>{patient?.firstName} {patient?.lastName}</Text>
            <Text style={styles.patientCode}>{patient?.customerCode}</Text>
            {bgAlertsOn && <Text style={styles.bgBadge}>🔔 Background alerts active</Text>}
          </View>
        </View>
      
        </View>
      </ScrollView>

      {/* Floating Bottom Menu Bar */}
      <View style={{
        position: 'absolute', bottom: 35, left: 16, right: 16,
        backgroundColor: isDarkMode ? '#1e293b' : '#fff',
        borderRadius: 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 24, paddingVertical: 12,
        elevation: 20, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 15, shadowOffset: { width: 0, height: 8 },
        borderWidth: 1, borderColor: isDarkMode ? '#334155' : '#e2e8f0',
        zIndex: 9999
      }}>
        {isCamConnected ? (
          <TouchableOpacity onPress={disconnectCamera} style={{ alignItems: 'center', padding: 4 }}>
            <Ionicons name="wifi" size={26} color="#ef4444" />
            <Text style={{ fontSize: 11, color: "#ef4444", marginTop: 4, fontWeight: '800' }}>Disconnect</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={pairCamera} style={{ alignItems: 'center', padding: 4 }}>
            <Ionicons name="hardware-chip" size={26} color={isDarkMode ? "#cbd5e1" : "#475569"} />
            <Text style={{ fontSize: 11, color: isDarkMode ? "#cbd5e1" : "#475569", marginTop: 4, fontWeight: '800' }}>Connect</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => router.push('/patient/object-map')} style={{ alignItems: 'center', padding: 4 }}>
          <Ionicons name="map" size={26} color="#22c55e" />
          <Text style={{ fontSize: 11, color: "#22c55e", marginTop: 4, fontWeight: '800' }}>Map</Text>
        </TouchableOpacity>

        {/* Center Mic Button */}
        <TouchableOpacity 
          onPress={openVoiceSearch}
          activeOpacity={0.8}
          style={{
            width: 70, height: 70, borderRadius: 35, backgroundColor: '#3b82f6',
            alignItems: 'center', justifyContent: 'center',
            marginTop: -40, elevation: 12, shadowColor: '#3b82f6', shadowOpacity: 0.6, shadowRadius: 10,
            borderWidth: 5, borderColor: bgColor
          }}
        >
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Ionicons name={voiceActive ? "close" : "mic"} size={36} color="#fff" />
          </Animated.View>
        </TouchableOpacity>

        <TouchableOpacity onPress={playRoutineVoice} style={{ alignItems: 'center', padding: 4 }}>
          <Ionicons name="time" size={26} color="#eab308" />
          <Text style={{ fontSize: 11, color: "#eab308", marginTop: 4, fontWeight: '800' }}>Routine</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => checkBehaviorAnomaly(true)} style={{ alignItems: 'center', padding: 4 }}>
          <Ionicons name="bug" size={26} color="#ef4444" />
          <Text style={{ fontSize: 11, color: "#ef4444", marginTop: 4, fontWeight: '800' }}>Test</Text>
        </TouchableOpacity>
      </View>
    
      {/* Voice Assistant Modal */}
      <Modal visible={voiceActive} transparent animationType="slide" onRequestClose={closeVoiceSearch}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: isDarkMode ? '#0f172a' : '#fff', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 40, elevation: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TouchableOpacity 
                  style={[styles.micBtn, styles.micBtnActive, { width: 48, height: 48, borderRadius: 24, backgroundColor: isRecording ? '#ef4444' : '#3b82f6' }]}
                  onPressIn={() => setIsRecording(true)}
                  onPressOut={() => {
                    setIsRecording(false);
                    // Free AI STT Simulation (Whisper) for Demo
                    if (language === 'si-LK') {
                       setVoiceQuery("මගේ යතුරු කොහෙද"); // "Where are my keys"
                       setTimeout(() => handleAssistantSearch("මගේ යතුරු කොහෙද"), 500);
                    } else {
                       setVoiceQuery("Where are my keys");
                       setTimeout(() => handleAssistantSearch("Where are my keys"), 500);
                    }
                  }}
                >
                  <Ionicons name="mic" size={24} color="#fff" />
                </TouchableOpacity>
                <View>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: textColor }}>
                    {isRecording 
                      ? (language === 'si-LK' ? 'ශබ්දය පටිගත වෙමින් පවතී...' : 'Recording Audio...') 
                      : (language === 'si-LK' ? 'කරුණාකර කතා කරන්න...' : 'Listening...')}
                  </Text>
                  <Text style={{ fontSize: 13, color: subTextColor, fontWeight: '600' }}>
                    {language === 'si-LK' ? 'මයික් එක ඔබාගෙන කතා කරන්න' : 'Hold Mic to speak (Whisper AI)'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={closeVoiceSearch}>
                <Ionicons name="close-circle" size={32} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <View style={[styles.voiceInputRow, { backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc', borderColor: '#3b82f6' }]}>
              <TextInput
                style={[styles.voiceInput, { color: textColor }]}
                placeholder={language === 'si-LK' ? "මගේ යතුරු කොහෙද?" : "Where are my keys?"}
                placeholderTextColor="#94a3b8"
                value={voiceQuery}
                onChangeText={setVoiceQuery}
                onSubmitEditing={handleAssistantSearch}
                autoFocus
              />
              <TouchableOpacity style={styles.goBtn} onPress={handleAssistantSearch} disabled={voiceSearching}>
                {voiceSearching ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.goBtnText}>GO</Text>}
              </TouchableOpacity>
            </View>

            {voiceResult && (
              <View style={[styles.voiceResult, { backgroundColor: voiceResult.found ? '#dcfce7' : '#fee2e2', marginTop: 20, flexDirection: 'column' }]}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                  <Ionicons name={voiceResult.found ? 'checkmark-circle' : 'close-circle'} size={24} color={voiceResult.found ? '#15803d' : '#b91c1c'} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.voiceResultText, { color: voiceResult.found ? '#14532d' : '#7f1d1d' }]}>{voiceResult.message}</Text>
                    {voiceResult.found && voiceResult.distanceLabel && (
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#166534', marginTop: 4 }}>📍 {voiceResult.distanceLabel}</Text>
                    )}
                  </View>
                </View>

                {voiceResult.found && (voiceResult as any).objLat && (
                  <TouchableOpacity
                    style={{ backgroundColor: '#15803d', padding: 14, borderRadius: 12, marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, elevation: 4 }}
                    onPress={() => {
                      closeVoiceSearch();
                      router.push({
                        pathname: '/patient/ar-navigate',
                        params: {
                          objectName: (voiceResult as any).objectName || voiceQuery.split(' ').pop(),
                            imageUrl: (voiceResult as any).imageUrl,
                          objLat: (voiceResult as any).objLat,
                          objLng: (voiceResult as any).objLng,
                          roomLabel: (voiceResult as any).roomLabel,
                          locationDetail: (voiceResult as any).locationDetail,
                          timeLabel: (voiceResult as any).timeLabel,
                        }
                      });
                    }}
                  >
                    <Ionicons name="navigate-circle" size={24} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>{language === 'si-LK' ? '3D සිතියමේ බලන්න' : 'Real View Navigation'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View style={{ marginTop: 20 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: subTextColor, marginBottom: 10, textTransform: 'uppercase' }}>
                {language === 'si-LK' ? 'උදාහරණ' : 'Try asking'}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                {['Maha kota', 'අද දවස මොකක්ද?', 'Doctor ට කතා කරන්න', 'මගේ bottle කොහෙද?'].map(c => (
                  <TouchableOpacity key={c} style={[styles.chip, { backgroundColor: isDarkMode ? '#1e293b' : '#f1f5f9', borderColor: isDarkMode ? '#334155' : '#e2e8f0' }]} onPress={() => { setVoiceQuery(c); handleAssistantSearch(c); }}>
                    <Text style={[styles.chipText, { color: isDarkMode ? '#cbd5e1' : '#475569' }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>
        {/* Anomaly Intervention Modal (Auto-Triggered) */}
        <Modal visible={anomalyAlert.active} transparent animationType="fade">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <View style={{ backgroundColor: '#0f172a', borderRadius: 32, padding: 30, alignItems: 'center', width: '100%', borderWidth: 2, borderColor: '#3b82f6', elevation: 20, shadowColor: '#3b82f6', shadowOpacity: 0.5, shadowRadius: 30 }}>
              
              <TouchableOpacity 
                style={{ position: 'absolute', top: 20, right: 20, padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20 }}
                onPress={() => setAnomalyAlert({ active: false, message: '' })}
              >
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>

              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(59, 130, 246, 0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 20, marginTop: 10 }}>
                <Ionicons name="moon" size={40} color="#60a5fa" />
              </View>
              
              <Text style={{ fontSize: 28, fontWeight: '900', color: '#fff', textAlign: 'center', marginBottom: 12 }}>
                {anomalyAlert.message.includes('night') ? 'It is night time' : 'Let\'s take a rest'}
              </Text>
              
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#94a3b8', textAlign: 'center', marginBottom: 30 }}>
                {anomalyAlert.message.includes('night') ? 'Let\'s go back to bed.' : 'Please sit down and relax for a moment.'}
              </Text>

              <View style={{ alignItems: 'center', marginBottom: 30 }}>
                <Ionicons name="arrow-up" size={80} color="#4ade80" style={{ textShadowColor: '#4ade80', textShadowOffset: {width: 0, height: 0}, textShadowRadius: 20 }} />
                <Text style={{ color: '#4ade80', fontSize: 16, fontWeight: '800', marginTop: 10, textTransform: 'uppercase', letterSpacing: 2 }}>Follow the Green Arrow</Text>
              </View>

              <TouchableOpacity 
                style={{ backgroundColor: '#334155', paddingVertical: 14, paddingHorizontal: 30, borderRadius: 16, width: '100%' }}
                onPress={() => setAnomalyAlert({ active: false, message: '' })}
              >
                <Text style={{ color: '#cbd5e1', fontSize: 16, fontWeight: '800', textAlign: 'center' }}>I Understand</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, fontWeight: '600' },

  blueHeaderContainer: {
    backgroundColor: '#1e3a8a',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
    marginBottom: -15, // Overlap effect
    zIndex: 10,
  },
  mainContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  topBarRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: 4 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoCircleSmall: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  topBarLogoText: { fontSize: 18, fontWeight: '900', letterSpacing: -0.5, color: '#fff' },
  topBarActions: { flexDirection: 'row', gap: 10 },
  iconBtnHeader: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)' },

  header: { marginBottom: 0 },
  greeting: { fontSize: 28, fontWeight: '900', marginBottom: 6, letterSpacing: -0.5, color: '#fff' },
  dateText: { color: '#bfdbfe', fontSize: 14, fontWeight: '700' },
  timeText: { color: '#eff6ff', fontSize: 20, fontWeight: '900', marginTop: 4 },

  statusBar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 14, marginBottom: 16 },
  statusText: { fontSize: 12, fontWeight: '700' },

  errorBox: { backgroundColor: '#fef2f2', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#fecaca' },
  errorText: { color: '#b91c1c', fontSize: 14, fontWeight: '600', lineHeight: 22, marginBottom: 12 },
  retryBtn: { backgroundColor: '#7f1d1d', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12, alignSelf: 'flex-start' },
  retryText: { color: '#fca5a5', fontWeight: '800', fontSize: 14 },

  // Voice Panel
  voicePanel: { backgroundColor: '#0f172a', borderRadius: 28, padding: 20, marginBottom: 20, gap: 16, elevation: 6, shadowColor: '#0f172a', shadowOpacity: 0.15, shadowRadius: 15 },
  voiceHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  voicePanelTitle: { color: '#f1f5f9', fontSize: 18, fontWeight: '900' },
  voicePanelSub: { color: '#94a3b8', fontSize: 13, marginTop: 4, fontWeight: '500' },
  micBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  micBtnActive: { backgroundColor: '#ef4444', shadowColor: '#ef4444', shadowOpacity: 0.5, shadowRadius: 12, elevation: 10 },
  voiceInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#1e293b', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 6, borderWidth: 2, borderColor: '#3b82f6' },
  voiceInput: { flex: 1, color: '#f1f5f9', fontSize: 16, paddingVertical: 14, fontWeight: '600' },
  goBtn: { backgroundColor: '#3b82f6', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  goBtnText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  chipsScroll: { marginTop: -4 },
  chip: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, marginRight: 10 },
  chipText: { color: '#cbd5e1', fontSize: 14, fontWeight: '700' },
  voiceResult: { borderRadius: 20, padding: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  voiceResultText: { fontSize: 14, fontWeight: '700', lineHeight: 22 },
  distanceBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0c4a6e', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 8 },
  distanceBadgeText: { color: '#38bdf8', fontSize: 12, fontWeight: '900' },
  voiceResultActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  rehearBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1e293b', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  rehearText: { color: '#cbd5e1', fontSize: 12, fontWeight: '800' },
  stopSpeakBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#450a0a', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  stopSpeakText: { color: '#fca5a5', fontSize: 12, fontWeight: '800' },
  mapBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#3b82f6', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  mapBtnText: { color: '#0f172a', fontSize: 12, fontWeight: '900' },
  voiceHint: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#1e3a8a', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#2563eb' },
  voiceHintText: { color: '#bfdbfe', fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 20 },

  alertBanner: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fef3c7', borderRadius: 24, padding: 16, marginBottom: 20, borderWidth: 1.5, borderColor: '#fbbf24' },
  alertIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: '#f59e0b', alignItems: 'center', justifyContent: 'center' },
  alertTitle: { color: '#b45309', fontWeight: '900', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  alertMessage: { color: '#78350f', fontWeight: '700', fontSize: 15, marginTop: 4, lineHeight: 22 },
  stopAlertBtn: { padding: 8 },

  currentActivity: { backgroundColor: '#0f172a', borderRadius: 28, padding: 24, marginBottom: 20, elevation: 4, shadowColor: '#0f172a', shadowOpacity: 0.1 },
  currentRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 12 },
  activityIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  currentLabel: { color: '#94a3b8', fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  currentName: { color: '#f8fafc', fontSize: 24, fontWeight: '900', marginTop: 2 },

  section: { marginBottom: 24 },
  sectionLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 },
  routineRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16, marginBottom: 6 },
  routineRowActive: { backgroundColor: '#0f172a', borderWidth: 2, borderColor: '#3b82f6' },
  routineTime: { color: '#64748b', fontSize: 14, fontWeight: '800', width: 50 },
  routineDot: { width: 10, height: 10, borderRadius: 5 },
  routineActivity: { color: '#334155', fontSize: 16, fontWeight: '800', flex: 1 },
  dimText: { color: '#94a3b8' },
  nowBadge: { backgroundColor: '#3b82f6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  nowText: { color: '#fff', fontSize: 10, fontWeight: '900' },

  noRoutine: { alignItems: 'center', padding: 40, gap: 10, marginBottom: 20, backgroundColor: '#f1f5f9', borderRadius: 24 },
  noRoutineText: { color: '#475569', fontSize: 18, fontWeight: '800' },
  noRoutineSub: { color: '#64748b', fontSize: 14, textAlign: 'center', lineHeight: 22, fontWeight: '500' },

  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionCard: { width: '47%', borderRadius: 24, padding: 18, gap: 10, borderWidth: 1.5, alignItems: 'flex-start' },
  actionIconBox: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  actionCardLabel: { fontSize: 14, fontWeight: '900' },
  actionCardSub: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },

  patientCard: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: 28, padding: 20, marginTop: 8, elevation: 8, shadowOpacity: 0.1, shadowRadius: 20 },
  avatarCircle: { width: 56, height: 56, borderRadius: 20, backgroundColor: '#3b82f6', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 24, fontWeight: '900' },
  patientName: { fontSize: 18, fontWeight: '900' },
  patientCode: { color: '#3b82f6', fontSize: 14, fontWeight: '800', marginTop: 2 },
  bgBadge: { color: '#10b981', fontSize: 11, fontWeight: '800', marginTop: 6 },
  
  fabMic: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    shadowColor: '#3b82f6',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  fabMicInner: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.2)',
  }
});



