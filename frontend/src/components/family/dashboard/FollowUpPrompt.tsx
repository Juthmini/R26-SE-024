import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { EngagementAlert } from '../../../types/family.types';

interface FollowUpPromptProps {
  alert: EngagementAlert;
  onAnswer: (outcome: 'positive' | 'neutral' | 'difficult') => void;
}

const OPTIONS: { key: 'positive' | 'neutral' | 'difficult'; emoji: string; label: string }[] = [
  { key: 'positive', emoji: '🙂', label: 'Went well' },
  { key: 'neutral', emoji: '😐', label: 'Okay' },
  { key: 'difficult', emoji: '🙁', label: 'Difficult' },
];

export const FollowUpPrompt: React.FC<FollowUpPromptProps> = ({ alert, onAnswer }) => (
  <View style={{ marginHorizontal: 20, marginTop: 20, backgroundColor: Colors.white, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: Colors.borderLight, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }}>
    <Text style={{ fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 2 }}>
      How did the call go?
    </Text>
    <Text style={{ fontSize: 12, color: Colors.textMuted, marginBottom: 14 }}>
      You called {alert.patientName} after "{alert.storyTitle}" — let us know how it went.
    </Text>

    <View style={{ flexDirection: 'row', gap: 10 }}>
      {OPTIONS.map((opt) => (
        <TouchableOpacity
          key={opt.key}
          onPress={() => onAnswer(opt.key)}
          style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 14, backgroundColor: Colors.background }}
        >
          <Text style={{ fontSize: 24, marginBottom: 4 }}>{opt.emoji}</Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.textSecondary }}>{opt.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  </View>
);
