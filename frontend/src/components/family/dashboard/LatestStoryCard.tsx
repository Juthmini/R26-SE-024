import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { MemorySessionReport } from '../../../services/family/emotionService';

interface LatestStoryCardProps {
  report: MemorySessionReport;
  patientName: string;
}

const EMOTION_EMOJI: Record<string, string> = {
  happy: '😊',
  sad: '😢',
  angry: '😠',
  surprise: '😲',
  fear: '😨',
  disgust: '😖',
  neutral: '😐',
};

const emoji = (emotion: string | null) => (emotion ? EMOTION_EMOJI[emotion] || '😐' : '—');

export const LatestStoryCard: React.FC<LatestStoryCardProps> = ({ report, patientName }) => {
  const [expanded, setExpanded] = useState(false);
  const shift = report.moodShiftPercent;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => setExpanded((e) => !e)}
      style={{ marginHorizontal: 20, marginTop: 20, backgroundColor: Colors.white, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: Colors.borderLight, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }}
    >
      <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.5, marginBottom: 10 }}>LATEST STORY WATCHED</Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {report.photoUrl ? (
          <Image source={{ uri: report.photoUrl }} style={{ width: 52, height: 52, borderRadius: 12 }} />
        ) : (
          <View style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: Colors.purpleSoft, justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="image-outline" size={22} color={Colors.purple} />
          </View>
        )}

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: Colors.purpleSoft }}>
              <Text style={{ fontSize: 9, fontWeight: '800', color: Colors.purple, textTransform: 'capitalize' }}>{report.category}</Text>
            </View>
            <Text style={{ fontSize: 11, color: Colors.textMuted }}>{report.triggeredAt}</Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginTop: 3 }} numberOfLines={1}>
            {report.storyTitle}
          </Text>
          <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 2 }}>
            {emoji(report.mostFrequentEmotion)} Mostly {report.mostFrequentEmotion || 'neutral'} · {shift > 0 ? '+' : ''}{shift}% mood shift
          </Text>
        </View>

        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
      </View>

      {expanded && (
        <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.borderLight }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={{ fontSize: 22 }}>{emoji(report.baselineEmotion)}</Text>
              <Text style={{ fontSize: 10, color: Colors.textMuted, fontWeight: '700', marginTop: 4 }}>STARTED</Text>
              <Text style={{ fontSize: 11, color: Colors.textPrimary, textTransform: 'capitalize' }}>{report.baselineEmotion}</Text>
            </View>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={{ fontSize: 22 }}>{emoji(report.peakEmotion)}</Text>
              <Text style={{ fontSize: 10, color: Colors.textMuted, fontWeight: '700', marginTop: 4 }}>PEAK</Text>
              <Text style={{ fontSize: 11, color: Colors.textPrimary, textTransform: 'capitalize' }}>{report.peakEmotion}</Text>
            </View>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={{ fontSize: 22 }}>{emoji(report.finalEmotion)}</Text>
              <Text style={{ fontSize: 10, color: Colors.textMuted, fontWeight: '700', marginTop: 4 }}>ENDED</Text>
              <Text style={{ fontSize: 11, color: Colors.textPrimary, textTransform: 'capitalize' }}>{report.finalEmotion}</Text>
            </View>
          </View>

          <View style={{ marginTop: 12, backgroundColor: Colors.background, borderRadius: 10, padding: 10 }}>
            <Text style={{ fontSize: 12, color: Colors.textSecondary, lineHeight: 18 }}>
              {shift > 10
                ? `${patientName}'s mood lifted noticeably (${shift > 0 ? '+' : ''}${shift}%) during this story.`
                : shift > 0
                  ? `${patientName}'s mood lifted a little (${shift > 0 ? '+' : ''}${shift}%) during this story.`
                  : shift < 0
                    ? `${patientName}'s mood dipped slightly (${shift}%) during this story — worth checking in.`
                    : `${patientName}'s mood stayed steady during this story.`}
              {' '}Read across {report.totalReadings} readings, mostly {report.mostFrequentEmotion || 'neutral'}.
            </Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
};
