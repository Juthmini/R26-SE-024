import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { speakStory, stopSpeaking } from '../../../services/family/ttsService';
import EmotionTracker from '../../family/EmotionTracker';

const API_URL = `${process.env.EXPO_PUBLIC_API_URL}/api`;

interface Memory {
  _id: string;
  photoUrl: string;
  familyNote: string;
  generatedStory: string;
}

export default function MemoryScreen() {
  const [patientId, setPatientId] = useState<string | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [thankYouFor, setThankYouFor] = useState<string | null>(null);

  const loadMemories = useCallback(async () => {
    setError('');
    try {
      const stored = await AsyncStorage.getItem('patient');
      const p = stored ? JSON.parse(stored) : null;
      const id = p?.id || p?._id;
      if (!id) {
        setError('No patient is logged in.');
        return;
      }
      setPatientId(id);

      const res = await axios.get(`${API_URL}/family/memories/patient/${id}`, { timeout: 10000 });
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

    axios.patch(`${API_URL}/family/memories/${memory._id}/play`).catch(() => {});

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
    <ScrollView
      className="flex-1 bg-blue-50"
      contentContainerStyle={{ padding: 24, paddingBottom: 112 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadMemories(); }} />}
    >
      <View className="mb-6">
        <Text className="text-4xl font-bold text-gray-900">Memory</Text>
        <Text className="text-lg text-gray-600 mt-2">Tap Listen to hear a story about a special moment</Text>
      </View>

      {loading ? (
        <View className="items-center py-16">
          <ActivityIndicator size="large" color="#2563eb" />
          <Text className="text-gray-500 mt-3">Loading your memories...</Text>
        </View>
      ) : error ? (
        <View className="bg-red-50 border border-red-200 rounded-2xl p-5">
          <Text className="text-red-700 font-semibold mb-3">{error}</Text>
          <TouchableOpacity onPress={loadMemories} className="bg-red-600 self-start px-4 py-2 rounded-xl">
            <Text className="text-white font-bold">Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : memories.length === 0 ? (
        <View className="items-center py-16">
          <Ionicons name="images-outline" size={56} color="#CBD5E1" />
          <Text className="text-gray-500 font-bold text-lg mt-3">No memories yet</Text>
        </View>
      ) : (
        memories.map((item) => {
          const isPlaying = playingId === item._id;
          return (
            <View key={item._id} className="bg-white rounded-3xl p-4 mb-5 shadow-sm">
              <Image source={{ uri: item.photoUrl }} className="w-full rounded-2xl mb-3" style={{ aspectRatio: 16 / 10 }} />
              <Text className="text-lg font-bold text-gray-900 mb-3" numberOfLines={isPlaying ? undefined : 2}>
                {item.familyNote}
              </Text>

              {isPlaying && (
                <View className="bg-purple-50 border border-purple-200 rounded-2xl p-4 mb-4">
                  <Text className="text-base font-semibold text-purple-950" style={{ lineHeight: 24 }}>
                    {item.generatedStory}
                  </Text>
                </View>
              )}

              {thankYouFor === item._id ? (
                <View className="flex-row items-center justify-center gap-2 bg-pink-50 border border-pink-200 rounded-2xl py-4">
                  <Ionicons name="heart" size={20} color="#EC4899" />
                  <Text className="text-pink-800 font-bold">Thank you for sharing that with me</Text>
                </View>
              ) : (
                <TouchableOpacity
                  className={`flex-row items-center justify-center gap-2 rounded-2xl py-4 ${isPlaying ? 'bg-red-600' : 'bg-blue-600'}`}
                  onPress={() => (isPlaying ? stopMemory() : playMemory(item))}
                  activeOpacity={0.85}
                >
                  <Ionicons name={isPlaying ? 'stop-circle' : 'play-circle'} size={28} color="#fff" />
                  <Text className="text-white font-extrabold text-base">{isPlaying ? 'Stop' : 'Listen'}</Text>
                </TouchableOpacity>
              )}

              {/* runs silently while this story is being read aloud */}
              {patientId && (
                <EmotionTracker
                  patientId={patientId}
                  memoryId={item._id}
                  isActive={isPlaying}
                />
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}
