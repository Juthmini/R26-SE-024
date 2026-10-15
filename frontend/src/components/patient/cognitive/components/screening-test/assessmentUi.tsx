import { SectionName } from '@/src/types/assessment.types';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Shared look for the MMSE screens. Class names are written out in full so
// NativeWind can pick them up at build time.
export const SECTION_THEME: Record<
  SectionName,
  {
    icon: IconName;
    solidIcon: IconName;
    color: string;
    gradient: readonly [string, string];
    chipBg: string;
    chipText: string;
    bar: string;
  }
> = {
  Orientation: { icon: 'compass-outline', solidIcon: 'compass', color: '#4f46e5', gradient: ['#818cf8', '#4f46e5'], chipBg: 'bg-indigo-100', chipText: 'text-indigo-700', bar: 'bg-indigo-500' },
  Registration: { icon: 'bulb-outline', solidIcon: 'bulb', color: '#7c3aed', gradient: ['#c084fc', '#7c3aed'], chipBg: 'bg-violet-100', chipText: 'text-violet-700', bar: 'bg-violet-500' },
  Attention: { icon: 'calculator-outline', solidIcon: 'calculator', color: '#d97706', gradient: ['#fcd34d', '#f97316'], chipBg: 'bg-amber-100', chipText: 'text-amber-700', bar: 'bg-amber-500' },
  Recall: { icon: 'refresh-circle-outline', solidIcon: 'refresh-circle', color: '#0d9488', gradient: ['#5eead4', '#0d9488'], chipBg: 'bg-teal-100', chipText: 'text-teal-700', bar: 'bg-teal-500' },
  Language: { icon: 'chatbubbles-outline', solidIcon: 'chatbubbles', color: '#db2777', gradient: ['#f9a8d4', '#db2777'], chipBg: 'bg-pink-100', chipText: 'text-pink-700', bar: 'bg-pink-500' },
};

const FALLBACK_THEME = SECTION_THEME.Orientation;

export const getSectionTheme = (section?: string) =>
  SECTION_THEME[section as SectionName] ?? FALLBACK_THEME;

export const tapFeedback = () => {
  Haptics.selectionAsync().catch(() => {});
};

export function SectionChip({ section }: { section: string }) {
  const theme = getSectionTheme(section);
  return (
    <View className={`flex-row items-center gap-1.5 self-start rounded-full px-3 py-1.5 ${theme.chipBg}`}>
      <Ionicons name={theme.icon} size={16} color={theme.color} />
      <Text className={`text-sm font-semibold ${theme.chipText}`}>{section}</Text>
    </View>
  );
}

const TONES = {
  info: { box: 'bg-blue-50 border-blue-100', icon: '#2563eb', title: 'text-blue-800', body: 'text-blue-700' },
  success: { box: 'bg-emerald-50 border-emerald-100', icon: '#059669', title: 'text-emerald-800', body: 'text-emerald-700' },
  caregiver: { box: 'bg-amber-50 border-amber-100', icon: '#d97706', title: 'text-amber-800', body: 'text-amber-700' },
} as const;

export function InfoCard({
  icon,
  title,
  children,
  tone = 'info',
}: {
  icon: IconName;
  title?: string;
  children?: React.ReactNode;
  tone?: keyof typeof TONES;
}) {
  const t = TONES[tone];
  return (
    <View className={`flex-row gap-3 rounded-2xl border p-4 ${t.box}`}>
      <Ionicons name={icon} size={22} color={t.icon} style={{ marginTop: 1 }} />
      <View className="flex-1 gap-1">
        {title && <Text className={`text-base font-semibold ${t.title}`}>{title}</Text>}
        {typeof children === 'string' ? (
          <Text className={`text-base leading-relaxed ${t.body}`}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

/** Large, tappable answer option with a letter badge. */
export function ChoiceCard({
  label,
  index,
  selected,
  onPress,
}: {
  label: string;
  index: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      className={`flex-row items-center gap-4 rounded-2xl border-2 px-4 py-4 ${
        selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
      }`}
      style={selected ? undefined : CARD_SHADOW}
    >
      <View
        className={`h-10 w-10 items-center justify-center rounded-xl ${
          selected ? 'bg-blue-500' : 'bg-gray-100'
        }`}
      >
        {selected ? (
          <Ionicons name="checkmark" size={22} color="white" />
        ) : (
          <Text className="text-base font-bold text-gray-500">
            {String.fromCharCode(65 + index)}
          </Text>
        )}
      </View>
      <Text
        className={`flex-1 text-lg font-medium ${selected ? 'text-blue-800' : 'text-gray-800'}`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/**
 * Caregiver "correct / incorrect" pair. With `locked`, the choice can't be
 * changed once made (matches the original behaviour of those questions).
 */
export function VerdictButtons({
  question,
  value,
  onSelect,
  locked = false,
  correctLabel = 'Correct',
  incorrectLabel = 'Incorrect',
}: {
  question: string;
  value: 'correct' | 'incorrect' | null;
  onSelect: (v: 'correct' | 'incorrect') => void;
  locked?: boolean;
  correctLabel?: string;
  incorrectLabel?: string;
}) {
  const disabled = locked && value !== null;

  const button = (kind: 'correct' | 'incorrect') => {
    const isCorrect = kind === 'correct';
    const isSelected = value === kind;
    const dimmed = value !== null && !isSelected;
    return (
      <TouchableOpacity
        onPress={() => {
          tapFeedback();
          onSelect(kind);
        }}
        disabled={disabled}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected, disabled }}
        className={`flex-1 items-center gap-1 rounded-2xl border-2 py-4 ${
          isSelected
            ? isCorrect
              ? 'border-emerald-500 bg-emerald-500'
              : 'border-rose-500 bg-rose-500'
            : isCorrect
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-rose-200 bg-rose-50'
        } ${dimmed ? 'opacity-50' : ''}`}
      >
        <Ionicons
          name={isCorrect ? 'checkmark-circle' : 'close-circle'}
          size={30}
          color={isSelected ? 'white' : isCorrect ? '#059669' : '#e11d48'}
        />
        <Text
          className={`text-base font-bold ${
            isSelected ? 'text-white' : isCorrect ? 'text-emerald-700' : 'text-rose-700'
          }`}
        >
          {isCorrect ? correctLabel : incorrectLabel}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <Ionicons name="person-circle-outline" size={20} color="#d97706" />
        <Text className="flex-1 text-base font-semibold text-gray-800">{question}</Text>
      </View>
      <View className="flex-row gap-3">
        {button('correct')}
        {button('incorrect')}
      </View>
      {value !== null && (
        <Text className="text-center text-sm text-gray-500">
          {locked ? 'Response recorded.' : 'Response recorded — tap the other option to change it.'}
        </Text>
      )}
    </View>
  );
}

export const CARD_SHADOW = {
  shadowColor: '#0f172a',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;
