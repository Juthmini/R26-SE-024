import { TriageLevel } from '@/src/types/dementia.types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { tapFeedback } from './assessmentUi';
import { Bubbles, Gradient, GRADIENTS, GradientButton, GradientView, IoniconName } from './visuals';

// Visual identity for the AI triage model, kept distinct from the MMSE blue
// and the section colours so the feature stands out wherever it appears.
export const AI_ACCENT = '#6d28d9'; // violet-700

const AI_SHADOW = {
  shadowColor: '#6d28d9',
  shadowOpacity: 0.18,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 6,
} as const;

// Class names are written out in full so NativeWind picks them up at build time.
export const TRIAGE_OUTCOME: Record<
  TriageLevel,
  {
    label: string;
    shortLabel: string;
    icon: IoniconName;
    accent: string;
    gradient: Gradient;
    softGradient: Gradient;
    text: string;
    dot: string;
  }
> = {
  monitor: {
    label: 'Keep an eye at home',
    shortLabel: 'At home',
    icon: 'home',
    accent: '#059669',
    gradient: GRADIENTS.emerald,
    softGradient: ['#ecfdf5', '#f0fdfa'],
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
  escalate: {
    label: 'See a doctor',
    shortLabel: 'See a doctor',
    icon: 'medkit',
    accent: '#e11d48',
    gradient: GRADIENTS.rose,
    softGradient: ['#fff1f2', '#fdf2f8'],
    text: 'text-rose-700',
    dot: 'bg-rose-500',
  },
};

export const TRIAGE_ORDER: TriageLevel[] = ['monitor', 'escalate'];

export function AiPill() {
  return (
    <View className="flex-row items-center gap-1 rounded-full border border-white/30 bg-white/20 px-2.5 py-1">
      <Ionicons name="sparkles" size={12} color="white" />
      <Text className="text-xs font-bold text-white">AI-powered</Text>
    </View>
  );
}

/** Gradient header + white body, shared by every triage state. */
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
    <View className="mb-4 w-full max-w-[640px] self-center rounded-[28px] bg-white" style={AI_SHADOW}>
      <View className="overflow-hidden rounded-[28px]">
        <GradientView colors={GRADIENTS.ai} className="px-5 py-5">
          <Bubbles />
          <View className="flex-row items-center gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-2xl border border-white/30 bg-white/20">
              <Ionicons name="sparkles" size={24} color="white" />
            </View>
            <View className="flex-1">
              <Text className="text-xl font-extrabold text-white">{title}</Text>
              <Text className="text-sm font-medium text-white/80">{subtitle}</Text>
            </View>
            <AiPill />
          </View>
        </GradientView>
        <View className="bg-white p-5">{children}</View>
      </View>
    </View>
  );
}

/** Primary (gradient) or secondary (soft outlined) action used in the triage UI. */
export function AiButton({
  label,
  icon,
  onPress,
  variant = 'primary',
  trailingIcon,
}: {
  label: string;
  icon?: IoniconName;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  trailingIcon?: IoniconName;
}) {
  if (variant === 'primary') {
    return (
      <GradientButton
        label={label}
        colors={GRADIENTS.ai}
        icon={icon}
        trailingIcon={trailingIcon}
        onPress={onPress}
      />
    );
  }
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      accessibilityRole="button"
      className="flex-row items-center justify-center gap-2 rounded-[20px] border border-violet-200 bg-violet-50 py-3.5"
    >
      {icon && <Ionicons name={icon} size={18} color={AI_ACCENT} />}
      <Text className="text-base font-bold text-violet-700">{label}</Text>
      {trailingIcon && <Ionicons name={trailingIcon} size={18} color={AI_ACCENT} />}
    </TouchableOpacity>
  );
}
