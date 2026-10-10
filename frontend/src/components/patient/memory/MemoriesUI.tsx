import React, { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, FlatList, Modal, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../../constants/colors';
import * as Speech from 'expo-speech';
import { useVideoPlayer, VideoView } from 'expo-video';

import axios from 'axios';
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.80:5000';
const AI_URL = process.env.EXPO_PUBLIC_AI_URL || 'http://192.168.1.80:8000';

export default function MemoryVaultScreen() {
  const router = useRouter();
  const [memories, setMemories] = useState<any[]>([]);
  const [trainingItem, setTrainingItem] = useState<any>(null);
  const [customName, setCustomName] = useState('');
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [summaryVideoUrl, setSummaryVideoUrl] = useState<string | null>(null);
  const [summaryLang, setSummaryLang] = useState<'en' | 'si'>('en');

  // expo-video's player is created once (hooks can't be called conditionally),
  // then its source is swapped via replaceAsync whenever a new summary video
  // is generated - this replaces expo-av's <Video source={...}> prop pattern,
  // which no longer works since Expo Go dropped expo-av's native module.
  const videoPlayer = useVideoPlayer(null, (player) => {
    player.loop = false;
  });

  useEffect(() => {
    if (summaryVideoUrl) {
      videoPlayer.replaceAsync(summaryVideoUrl).then(() => videoPlayer.play());
    }
  }, [summaryVideoUrl]);

  const generateTodaySummary = async () => {
    try {
      setGeneratingSummary(true);
      setSummaryVideoUrl(null);
      setSummaryText('');

      const stored = await AsyncStorage.getItem('patient');
      if (!stored) {
        Alert.alert('Not logged in', 'Please log in again.');
        return;
      }
      const patient = JSON.parse(stored);
      // Must match the same id Find My Things uses to log events (patient.id,
      // the real Mongo ObjectId) - not customerCode, or diary events logged
      // under one id would never be found under the other.
      const patientId = patient.id || patient._id;

      const res = await axios.get(`${AI_URL}/generate-diary-video/${patientId}`, {
        params: { lang: summaryLang },
        timeout: 60000,
      });
      const data = res.data;

      if (data.status === 'error') {
        Alert.alert('Could not generate summary', data.message || 'Please try again.');
        return;
      }

      setSummaryText(data.diary || '');
      if (data.diary) {
        Speech.speak(data.diary, { language: summaryLang === 'si' ? 'si-LK' : 'en-US' });
      }
      if (data.video_url) {
        setSummaryVideoUrl(`${AI_URL}${data.video_url}`);
      }
    } catch (e) {
      Alert.alert('Could not generate summary', 'Check your connection and that the backend is running.');
    } finally {
      setGeneratingSummary(false);
    }
  };

  useEffect(() => {
    loadMemories();
  }, []);

  const loadMemories = async () => {
    try {
      const stored = await AsyncStorage.getItem('patient');
      if (stored) {
        const patientId = JSON.parse(stored).id;
        
        let allMemories: any[] = [];

        // 1. Load local auto-saved memories
        const memKey = `patient_memories_${patientId}`;
        const storedMemoriesStr = await AsyncStorage.getItem(memKey);
        if (storedMemoriesStr) {
          allMemories = [...JSON.parse(storedMemoriesStr)];
        }

        // 2. Fetch Bulk Uploaded Objects from Web (Backend)
        try {
          const res = await axios.get(`${BASE_URL}/api/admin/personal-objects/patient/${patientId}`);
          if (res.data.success) {
            const backendObjects = res.data.data.map((obj: any) => ({
              id: obj._id,
              name: obj.objectName,
              relationship: 'Known Object',
              image: `${BASE_URL}${obj.imageUrl}`, // Web uploaded photo URL
              color: '#dcfce7' // distinct color for bulk-uploaded items
            }));
            
            // Merge avoiding duplicates by name
            const existingNames = new Set(allMemories.map(m => m.name.toLowerCase()));
            backendObjects.forEach((bo: any) => {
              if (!existingNames.has(bo.name.toLowerCase())) {
                allMemories.push(bo);
              }
            });
          }
        } catch (backendErr) {
          console.warn('Could not fetch backend objects:', backendErr);
        }

        // 3. Fetch Real-time Objects from ESP32 Camera (Python Backend)
        try {
          // The patient code or ID used to pair
          const pId = JSON.parse(stored).customerCode || patientId || 'PAT-2026-003';
          const pyRes = await axios.get(`${AI_URL}/vault/${pId}`);
          if (pyRes.data.status === 'success' && pyRes.data.vault) {
            let foundTrainingItem = null;
            
            const pyObjects = pyRes.data.vault.map((obj: any) => {
              if (obj.needs_training && !foundTrainingItem) {
                foundTrainingItem = obj;
              }
              return {
                id: obj.id,
                name: obj.object,
                original_object: obj.original_object,
                relationship: obj.type || 'Detected Live',
                image: obj.image_url || `https://via.placeholder.com/150/e0e0e0/808080?text=${obj.object}`,
                color: obj.is_favorite ? '#fef08a' : '#e0e7ff', // yellow for favs, blue for normal
                is_favorite: obj.is_favorite,
                time: obj.time,
                lat: obj.lat,
                lng: obj.lng
              };
            });
            
            // Add to the top of the list
            allMemories = [...pyObjects.reverse(), ...allMemories];
            
            // Trigger popup if an item needs training and we aren't already training
            if (foundTrainingItem && !trainingItem) {
              setTrainingItem(foundTrainingItem);
              Speech.speak(`I have seen this ${foundTrainingItem.object} several times. What should I call it?`, { language: 'en-US' });
            }
          }
        } catch (pyErr) {
          console.warn('Could not fetch Python vault:', pyErr);
        }

        setMemories(allMemories);
      }
    } catch (e) {
      console.error('Failed to load memories', e);
    }
  };

  const handleTrainObject = async () => {
    if (!customName.trim()) return;
    try {
      const stored = await AsyncStorage.getItem('patient');
      const pId = stored ? (JSON.parse(stored).customerCode || JSON.parse(stored).id) : 'PAT-2026-003';
      
      const res = await axios.post(`${AI_URL}/train-object`, {
        patient_id: pId,
        original_object: trainingItem.original_object,
        custom_name: customName
      });
      
      if (res.data.status === 'success') {
        Alert.alert("Success", "Object remembered successfully!");
        setTrainingItem(null);
        setCustomName('');
        loadMemories(); // reload to show updated name and yellow color
      }
    } catch (err) {
      Alert.alert("Error", "Could not train object.");
    }
  };

  const handleStrangerAlert = async () => {
    try {
      const stored = await AsyncStorage.getItem('patient');
      const pId = stored ? (JSON.parse(stored).customerCode || JSON.parse(stored).id) : 'PAT-2026-003';
      
      const res = await axios.post(`${AI_URL}/alert-stranger`, {
        patient_id: pId,
        image_url: trainingItem.image
      });
      
      if (res.data.status === 'success') {
        Alert.alert("ðŸš¨ SOS Sent", "Your guardian has been notified about the unknown person.");
        setTrainingItem(null);
      }
    } catch (err) {
      Alert.alert("Error", "Could not send alert.");
    }
  };

  const playAudio = (item: any) => {
    Speech.stop();
    const message = item.relationship === 'Known Object' 
      ? `This is your ${item.name}.`
      : `This is a memory of ${item.name}. ${item.relationship ? `It is related to your ${item.relationship}.` : ''}`;
    
    Speech.speak(message, { language: 'en-US', rate: 0.9, pitch: 1.0 });
  };

  const deleteMemory = async (id: string, name: string) => {
    try {
      const stored = await AsyncStorage.getItem('patient');
      if (stored) {
        const pId = JSON.parse(stored).customerCode || JSON.parse(stored).id || 'PAT-2026-003';
        
        // Remove from local storage array
        const memKey = `patient_memories_${pId}`;
        const storedMemoriesStr = await AsyncStorage.getItem(memKey);
        if (storedMemoriesStr) {
          let localMem = JSON.parse(storedMemoriesStr);
          localMem = localMem.filter((m: any) => m.id !== id && m.name !== name);
          await AsyncStorage.setItem(memKey, JSON.stringify(localMem));
        }
        
        // Remove from backend vault
        try {
          await axios.delete(`${AI_URL}/vault/${pId}/${id}`);
        } catch(err) {
          console.warn("Could not delete from backend:", err);
        }
        
        // Update state
        setMemories(prev => prev.filter(m => m.id !== id && m.name !== name));
      }
    } catch (e) {
      console.error('Failed to delete memory', e);
    }
  };

  const openMapForMemory = (item: any) => {
    router.push({ 
      pathname: '/patient/ar-navigate', 
      params: { 
        objectName: item.name || item.object || item.original_object,
        imageUrl: item.image_url || item.image,
        objLat: item.lat ? item.lat.toString() : '',
        objLng: item.lng ? item.lng.toString() : '',
        conflict: item.conflict
      } 
    });
  };

  const handleEditMemory = (item: any) => {
    // Make sure we pass the original object so the backend knows what to rename
    setTrainingItem({
      original_object: item.original_object || item.name,
      image: item.image,
    });
    setCustomName(item.name);
  };

  const renderMemoryItem = ({ item }: any) => (
    <View style={[styles.memoryCard, { backgroundColor: item.color || '#EEF4FF' }]}>
      <TouchableOpacity onPress={() => playAudio(item)}>
        <Image source={{ uri: item.image }} style={styles.memoryImage} />
        <View style={styles.memoryInfo}>
          <Text style={styles.memoryName}>{item.name}</Text>
          <Text style={styles.memoryRelation}>{item.relationship}</Text>
        </View>
      </TouchableOpacity>
      
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => playAudio(item)}>
           <Ionicons name="play-circle" size={26} color={Colors.sageGreen} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => openMapForMemory(item)}>
           <Ionicons name="map" size={22} color="#3b82f6" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => handleEditMemory(item)}>
           <Ionicons name="create" size={22} color="#f59e0b" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => deleteMemory(item.id, item.name)}>
           <Ionicons name="trash" size={22} color="#ef4444" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Memory Vault</Text>
        <Text style={styles.subtitle}>Your loved ones and favorite moments.</Text>
      </View>

      <View style={styles.summaryBox}>
        <View style={styles.langToggleRow}>
          <TouchableOpacity
            style={[styles.langPill, summaryLang === 'en' && styles.langPillActive]}
            onPress={() => setSummaryLang('en')}
          >
            <Text style={[styles.langPillText, summaryLang === 'en' && styles.langPillTextActive]}>English</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.langPill, summaryLang === 'si' && styles.langPillActive]}
            onPress={() => setSummaryLang('si')}
          >
            <Text style={[styles.langPillText, summaryLang === 'si' && styles.langPillTextActive]}>සිංහල</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.generateBtn}
          onPress={generateTodaySummary}
          disabled={generatingSummary}
        >
          {generatingSummary ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="sparkles" size={18} color="#fff" />
              <Text style={styles.generateBtnText}>Generate Today's Summary</Text>
            </>
          )}
        </TouchableOpacity>

        {summaryText ? (
          <View style={styles.summaryResult}>
            <Text style={styles.summaryResultText}>{summaryText}</Text>
            {summaryVideoUrl && (
              <VideoView
                player={videoPlayer}
                style={styles.summaryVideo}
                nativeControls
                contentFit="contain"
              />
            )}
          </View>
        ) : null}
      </View>

      <FlatList
        data={memories}
        renderItem={renderMemoryItem}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.columnWrapper}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="images-outline" size={48} color="#cbd5e1" />
            <Text style={styles.emptyText}>No memories saved yet.</Text>
            <Text style={styles.emptySub}>Scan objects to add them to your vault.</Text>
          </View>
        }
      />

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity 
          style={styles.navItem}
          onPress={() => router.push('/patient')}
        >
           <View style={styles.navIconBox}>
              <Ionicons name="home-outline" size={28} color="#475569" />
           </View>
           <Text style={styles.navText}>Home</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.navItem}
          onPress={() => router.push('/patient/memories')}
        >
           <View style={[styles.navIconBox, styles.activeNav]}>
              <Ionicons name="heart" size={28} color={Colors.sageGreen} />
           </View>
           <Text style={[styles.navText, { color: Colors.sageGreen }]}>Memories</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.helpBtn}
          onPress={() => router.push('/patient/voice-assistant')}
        >
           <View style={styles.helpIconBox}>
              <Ionicons name="alert-circle" size={32} color="#fff" />
           </View>
           <Text style={styles.helpText}>HELP</Text>
        </TouchableOpacity>
        </View>

        {/* AI Training Popup Modal */}
        <Modal visible={!!trainingItem} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Ionicons name="bulb" size={40} color="#eab308" />
              <Text style={styles.modalTitle}>What is this?</Text>
              <Text style={styles.modalText}>I've seen this {trainingItem?.original_object} many times. Please give it a custom name to remember it (e.g., "My Red Brush").</Text>
              
              <Image source={{ uri: trainingItem?.image }} style={{ width: 100, height: 100, borderRadius: 10, marginVertical: 10 }} />
              
              <TextInput
                style={styles.textInput}
                placeholder="Enter custom name..."
                value={customName}
                onChangeText={setCustomName}
              />
              
              <View style={styles.modalActions}>
                <TouchableOpacity onPress={() => handleStrangerAlert()} style={[styles.modalBtn, { backgroundColor: '#ef4444' }]}>
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>Stranger!</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setTrainingItem(null)} style={[styles.modalBtn, { backgroundColor: '#cbd5e1' }]}>
                  <Text style={{ fontWeight: 'bold' }}>Skip</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleTrainObject} style={[styles.modalBtn, { backgroundColor: '#10b981' }]}>
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 25,
    paddingTop: 20,
    marginBottom: 20,
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: '#0F172A',
  },
  summaryBox: {
    marginHorizontal: 25,
    marginBottom: 20,
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  langToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  langPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  langPillActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  langPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  langPillTextActive: {
    color: '#fff',
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3B82F6',
    borderRadius: 16,
    paddingVertical: 14,
  },
  generateBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  summaryResult: {
    marginTop: 14,
    gap: 12,
  },
  summaryResultText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1E293B',
    fontWeight: '500',
  },
  summaryVideo: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: '#000',
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 5,
  },
  listContent: {
    paddingHorizontal: 15,
    paddingBottom: 120,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  memoryCard: {
    width: '47%',
    borderRadius: 30,
    padding: 12,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  memoryImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 22,
    marginBottom: 12,
  },
  memoryInfo: {
    alignItems: 'center',
    marginBottom: 10,
  },
  memoryName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E293B',
  },
  memoryRelation: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 5,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  actionBtn: {
    padding: 5,
  },
  bottomNav: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    height: 90,
    backgroundColor: '#fff',
    borderRadius: 30,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  navItem: {
    alignItems: 'center',
  },
  navIconBox: {
    padding: 10,
    borderRadius: 15,
  },
  activeNav: {
    backgroundColor: Colors.sageGreen + '15',
  },
  navText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  helpBtn: {
    alignItems: 'center',
  },
  helpIconBox: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  helpText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#EF4444',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center'
  },
  modalContent: {
    backgroundColor: '#fff', width: '85%', padding: 20, borderRadius: 24, alignItems: 'center'
  },
  modalTitle: {
    fontSize: 24, fontWeight: 'bold', color: '#1e3a8a', marginTop: 10
  },
  modalText: {
    textAlign: 'center', color: '#475569', marginVertical: 10
  },
  textInput: {
    borderWidth: 1, borderColor: '#cbd5e1', width: '100%', borderRadius: 12, padding: 12, marginTop: 10, marginBottom: 20
  },
  modalActions: {
    flexDirection: 'row', gap: 10, width: '100%', justifyContent: 'center'
  },
  modalBtn: {
    paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, minWidth: 100, alignItems: 'center'
  }
});

