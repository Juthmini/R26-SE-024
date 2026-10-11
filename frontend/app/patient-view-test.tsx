// ─────────────────────────────────────────────────────────────────────────
//  TEST SCREEN — patient-side story listening + emotion capture demo.
//  Deliberately kept OUTSIDE app/patient/** (that folder belongs to the
//  patient-portal teammate's work and is not touched here). This is a
//  standalone route for demoing/testing the real "patient listens, emotion
//  gets captured" flow using memories already created via the family module.
// ─────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  SafeAreaView, ActivityIndicator, RefreshControl, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { speakStory, stopSpeaking } from '../src/services/family/ttsService';
import EmotionTracker from '../src/components/family/EmotionTracker';
import { getLinkedPatient } from '../src/services/family/familyService';

const API_URL = `${process.env.EXPO_PUBLIC_API_URL}/api`;

interface Memory {
  _id: string;
  photoUrl: string;
  familyNote: string;
  generatedStory: string;
}

export default function PatientViewTest() {
  const patient = getLinkedPatient(); // same demo patient the family module uses

  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [thankYouFor, setThankYouFor] = useState<string | null>(null);

  const loadMemories = useCallback(async () => {
    setError('');
    try {
      const res = await axios.get(`${API_URL}/family/memories/patient/${patient.id}`, { timeout: 10000 });
      if (res.data.success) setMemories(res.data.memories || []);
    } catch {
      setError('Could not load memories. Check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadMemories(); }, [loadMemories]);

  const playMemory = (memory: Memory) => {
    stopSpeaking();
    setThankYouFor(null);
    setPlayingId(memory._id);

    speakStory(memory.generatedStory, () => {
      setPlayingId(null);
      setThankYouFor(memory._id);
    });
  };

  const stopMemory = () => {
    stopSpeaking();
    setPlayingId(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Text style={styles.title}>Your Memories</Text>
        <Text style={styles.subtitle}>Tap Listen to hear a story about a special moment</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.purple} />
          <Text style={styles.loadingText}>Loading your memories...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadMemories(); }} />}
        >
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={loadMemories} style={styles.retryBtn}>
                <Text style={styles.retryText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : memories.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="images-outline" size={56} color="#CBD5E1" />
              <Text style={styles.emptyText}>No memories yet</Text>
            </View>
          ) : (
            memories.map((item) => {
              const isPlaying = playingId === item._id;
              return (
                <View key={item._id} style={styles.card}>
                  <Image source={{ uri: item.photoUrl }} style={styles.cardImage} />
                  <Text style={styles.cardNote} numberOfLines={isPlaying ? undefined : 2}>
                    {item.familyNote}
                  </Text>

                  {/* full story text stays on screen the whole time it's
                      being read aloud, so the patient can follow along
                      visually as well as by ear */}
                  {isPlaying && (
                    <View style={styles.storyTextBox}>
                      <Text style={styles.storyText}>{item.generatedStory}</Text>
                    </View>
                  )}

                  {thankYouFor === item._id ? (
                    <View style={styles.thankYouBox}>
                      <Ionicons name="heart" size={22} color="#EC4899" />
                      <Text style={styles.thankYouText}>Thank you for sharing that with me</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.playBtn, isPlaying && styles.playBtnActive]}
                      onPress={() => (isPlaying ? stopMemory() : playMemory(item))}
                      activeOpacity={0.85}
                    >
                      <Ionicons name={isPlaying ? 'stop-circle' : 'play-circle'} size={30} color="#fff" />
                      <Text style={styles.playBtnText}>{isPlaying ? 'Stop' : 'Listen'}</Text>
                    </TouchableOpacity>
                  )}

                  {/* runs silently while this story is being read aloud */}
                  <EmotionTracker
                    patientId={patient.id}
                    memoryId={item._id}
                    isActive={isPlaying}
                  />
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const Colors = { purple: '#7C3AED' };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: '#78716C', fontSize: 15, fontWeight: '600' },

  header: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20 },
  title: { fontSize: 32, fontWeight: '900', color: '#1C1917' },
  subtitle: { fontSize: 16, fontWeight: '600', color: '#78716C', marginTop: 6, lineHeight: 22 },

  listContent: { paddingHorizontal: 20, paddingBottom: 40 },

  errorBox: { backgroundColor: '#FEF2F2', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#FECACA' },
  errorText: { color: '#B91C1C', fontSize: 15, fontWeight: '600', marginBottom: 12 },
  retryBtn: { backgroundColor: '#DC2626', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12, alignSelf: 'flex-start' },
  retryText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  emptyBox: { alignItems: 'center', padding: 60, gap: 12 },
  emptyText: { color: '#78716C', fontSize: 18, fontWeight: '700' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  cardImage: { width: '100%', aspectRatio: 16 / 10, borderRadius: 20, marginBottom: 14 },
  cardNote: { fontSize: 18, fontWeight: '700', color: '#1C1917', lineHeight: 25, marginBottom: 16 },

  playBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#7C3AED', borderRadius: 18, paddingVertical: 18,
  },
  playBtnActive: { backgroundColor: '#DC2626' },
  playBtnText: { color: '#fff', fontSize: 18, fontWeight: '900' },

  thankYouBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#FDF2F8', borderRadius: 18, paddingVertical: 18,
    borderWidth: 1, borderColor: '#FBCFE8',
  },
  thankYouText: { color: '#9D174D', fontSize: 16, fontWeight: '700' },

  storyTextBox: {
    backgroundColor: '#FAF5FF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  storyText: { fontSize: 17, fontWeight: '600', color: '#3B0764', lineHeight: 26 },
});
