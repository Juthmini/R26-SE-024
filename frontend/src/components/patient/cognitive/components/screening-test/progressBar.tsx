import React from 'react';
import { Text, View } from 'react-native';
import { getSectionTheme, SectionChip } from './assessmentUi';

interface Props {
  current: number;   // 1-based display
  total: number;
  sectionName: string;
}

export function ProgressBar({ current, total, sectionName }: Props) {
  const pct = Math.min(100, (current / Math.max(total, 1)) * 100);
  const theme = getSectionTheme(sectionName);

  return (
    <View className="px-6 pt-3 pb-3 gap-3">
      <View className="flex-row items-center justify-between">
        <SectionChip section={sectionName} />
        <Text className="text-sm font-medium text-gray-500">
          Question <Text className="font-bold text-gray-800">{current}</Text> of {total}
        </Text>
      </View>
      <View
        className="h-2.5 bg-gray-200 rounded-full overflow-hidden"
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: total, now: current }}
      >
        <View className={`h-full rounded-full ${theme.bar}`} style={{ width: `${pct}%` }} />
      </View>
    </View>
  );
}
