import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/colors';
import { MemorySessionReport } from '../../services/family/emotionService';

interface MoodTrendChartProps {
  reports: MemorySessionReport[]; // newest-first, as returned by the backend
}

const HALF_HEIGHT = 50;   // max bar height above/below the zero baseline
const BAR_WIDTH = 22;     // within the <=24px mark spec
const GAP = 10;
const LABEL_SLOT_HEIGHT = 16; // reserved so selecting a bar doesn't shift layout

export const MoodTrendChart: React.FC<MoodTrendChartProps> = ({ reports }) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // oldest -> newest, left to right
  const chronological = [...reports].reverse();
  const maxAbs = Math.max(1, ...chronological.map((r) => Math.abs(r.moodShiftPercent)));

  return (
    <View style={{ backgroundColor: Colors.white, borderRadius: 20, padding: 18, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textMuted, marginBottom: 4, letterSpacing: 0.5 }}>MOOD TREND</Text>
      <Text style={{ fontSize: 11, color: Colors.textMuted, marginBottom: 12 }}>
        Mood shift per session, oldest to newest — tap a bar for details
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          {chronological.map((r, i) => {
            const v = r.moodShiftPercent;
            const barHeight = Math.max(3, Math.round((Math.abs(v) / maxAbs) * HALF_HEIGHT));
            const isSelected = selectedIndex === i;
            const barColor = v > 0 ? Colors.success : v < 0 ? Colors.danger : Colors.textMuted;
            const isFirst = i === 0;
            const isLast = i === chronological.length - 1;

            return (
              <TouchableOpacity
                key={r.id}
                activeOpacity={0.7}
                onPress={() => setSelectedIndex(isSelected ? null : i)}
                style={{ width: BAR_WIDTH, marginRight: i === chronological.length - 1 ? 0 : GAP, alignItems: 'center' }}
              >
                {/* reserved label slot — always present so tapping doesn't shift the chart */}
                <View style={{ height: LABEL_SLOT_HEIGHT, justifyContent: 'flex-end' }}>
                  {isSelected && (
                    <Text style={{ fontSize: 10, fontWeight: '800', color: Colors.textPrimary }}>
                      {v > 0 ? '+' : ''}{v}%
                    </Text>
                  )}
                </View>

                {/* positive zone — bars anchored to the baseline, growing upward */}
                <View style={{ height: HALF_HEIGHT, width: '100%', justifyContent: 'flex-end', alignItems: 'center' }}>
                  {v >= 0 && (
                    <View
                      style={{
                        width: BAR_WIDTH,
                        height: v === 0 ? 3 : barHeight,
                        backgroundColor: barColor,
                        borderTopLeftRadius: 4,
                        borderTopRightRadius: 4,
                        opacity: isSelected || selectedIndex === null ? 1 : 0.4,
                      }}
                    />
                  )}
                </View>

                {/* zero baseline */}
                <View style={{ height: 1, width: BAR_WIDTH, backgroundColor: Colors.borderLight }} />

                {/* negative zone — bars anchored to the baseline, growing downward */}
                <View style={{ height: HALF_HEIGHT, width: '100%', alignItems: 'center' }}>
                  {v < 0 && (
                    <View
                      style={{
                        width: BAR_WIDTH,
                        height: barHeight,
                        backgroundColor: barColor,
                        borderBottomLeftRadius: 4,
                        borderBottomRightRadius: 4,
                        opacity: isSelected || selectedIndex === null ? 1 : 0.4,
                      }}
                    />
                  )}
                </View>

                {/* endpoint date labels only — selective labeling, not every bar */}
                <Text style={{ fontSize: 8, color: Colors.textMuted, marginTop: 4, textAlign: 'center' }} numberOfLines={1}>
                  {isFirst || isLast ? r.date.split(',')[0] : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};
