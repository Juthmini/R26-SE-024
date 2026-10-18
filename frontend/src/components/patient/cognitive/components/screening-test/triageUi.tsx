import { TriageLevel } from '@/src/types/dementia.types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { CARD_SHADOW, tapFeedback } from './assessmentUi';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Visual identity for the AI triage model, kept distinct from the MMSE blue
// and the section colours so the feature stands out wherever it appears.
export const AI_ACCENT = '#4f46e5'; // indigo-600

// Class names are written out in full so NativeWind picks them up at build time.
export const TRIAGE_OUTCOME: Record<
  TriageLevel,
  {
    label: string;
    shortLabel: string;
    icon: IconName;
    accent: string;
    tintBg: string;
    text: string;
    bar: string;
    dot: string;
  }
> = {
  monitor: {
    label: 'Keep an eye at home',
    shortLabel: 'At home',
    icon: 'home-outline',
    accent: '#059669',
    tintBg: 'bg-emerald-50',
    text: 'text-emerald-700',
    bar: 'bg-emerald-500',
    dot: 'bg-emerald-500',
  },
  escalate: {
    label: 'See a doctor',
    shortLabel: 'See a doctor',
    icon: 'medkit-outline',
    accent: '#e11d48',
    tintBg: 'bg-rose-50',
    text: 'text-rose-700',
    bar: 'bg-rose-500',
    dot: 'bg-rose-500',
  },
};

export const TRIAGE_ORDER: TriageLevel[] = ['monitor', 'escalate'];

export function AiPill() {
  return (
    <View className="flex-row items-center gap-1 rounded-full bg-white/20 px-2.5 py-1">
      {/* <Ionicons name="sparkles" size={12} color="white" />
      <Text className="text-xs font-bold text-white">AI-powered</Text> */}
    </View>
  );
}

/** Indigo header strip + white body, shared by every triage state. */
export function AiCardShell({
  title = 'AI Triage',
  subtitle = 'Dementia screening model',
  children,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-4 w-full max-w-[640px] self-center overflow-hidden rounded-3xl bg-white" style={CARD_SHADOW}>
      <View className="flex-row items-center gap-3 bg-indigo-600 px-5 py-4">
        <View className="h-11 w-11 items-center justify-center rounded-2xl bg-white/20">
          <Ionicons name="sparkles" size={22} color="white" />
        </View>
        <View className="flex-1">
          <Text className="text-lg font-extrabold text-white">{title}</Text>
          <Text className="text-xs font-medium text-indigo-100">{subtitle}</Text>
        </View>
        {/* <AiPill /> */}
      </View>
      <View className="p-5">{children}</View>
    </View>
  );
}

/** Primary (filled indigo) or secondary (outlined) action used in the triage UI. */
export function AiButton({
  label,
  icon,
  onPress,
  variant = 'primary',
  trailingIcon,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  trailingIcon?: IconName;
}) {
  const primary = variant === 'primary';
  const color = primary ? 'white' : AI_ACCENT;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      accessibilityRole="button"
      className={`flex-row items-center justify-center gap-2 rounded-2xl ${
        primary ? 'bg-indigo-600 py-4' : 'border-2 border-indigo-200 bg-white py-3'
      }`}
    >
      {icon && <Ionicons name={icon} size={primary ? 22 : 18} color={color} />}
      <Text className={`font-bold ${primary ? 'text-lg text-white' : 'text-base text-indigo-700'}`}>
        {label}
      </Text>
      {trailingIcon && <Ionicons name={trailingIcon} size={primary ? 22 : 18} color={color} />}
    </TouchableOpacity>
  );
}
