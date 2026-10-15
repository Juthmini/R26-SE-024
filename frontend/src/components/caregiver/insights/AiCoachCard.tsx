// frontend/src/components/caregiver/insights/AiCoachCard.tsx
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

interface Props {
  loading: boolean;
  message: string | null;
}

export const AiCoachCard: React.FC<Props> = ({ loading, message }) => {
  if (!loading && !message) return null;

  return (
    <Animated.View
      entering={FadeInUp.delay(80)}
      style={{
        backgroundColor: '#F5F3FF', borderRadius: 20, padding: 16, marginBottom: 16,
        borderWidth: 1, borderColor: '#DDD6FE',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <View style={{
          width: 34, height: 34, borderRadius: 17, backgroundColor: '#8B5CF6',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons name="sparkles" size={17} color="#fff" />
        </View>
        <Text style={{ fontSize: 14, fontWeight: '800', color: '#5B21B6' }}>
          A note from your AI coach
        </Text>
      </View>

      {loading ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ActivityIndicator size="small" color="#8B5CF6" />
          <Text style={{ fontSize: 13, color: '#6D28D9' }}>Writing something just for you...</Text>
        </View>
      ) : (
        <Text style={{ fontSize: 14, lineHeight: 21, color: '#4C1D95' }}>{message}</Text>
      )}
    </Animated.View>
  );
};