import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useId, useState } from 'react';
import {
  Animated,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { tapFeedback } from './assessmentUi';

// Decorative building blocks (gradients, glowing icon badges, score ring) for
// the MMSE intro/results and AI triage screens. Everything is drawn with
// react-native-svg, which the app already ships.

export type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
export type McIconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
export type Gradient = readonly [string, string, ...string[]];

/** SVG ids must be unique per instance and must not contain ":" (React's useId format). */
function useSvgId(prefix: string) {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

const stops = (colors: Gradient) =>
  colors.map((c, i) => (
    <Stop key={i} offset={i / (colors.length - 1)} stopColor={c} />
  ));

/**
 * An absolutely-filling SVG drawn at the parent's measured pixel size.
 * Percentage sizes ("100%") on react-native-svg get resolved against a stale
 * first layout on iOS, leaving gradients cut short — so measure instead.
 */
function FillSvg({ children }: { children: (w: number, h: number) => React.ReactNode }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((prev) =>
          prev && prev.w === width && prev.h === height ? prev : { w: width, h: height },
        );
      }}
    >
      {size && size.w > 0 && size.h > 0 && (
        <Svg width={size.w} height={size.h}>
          {children(size.w, size.h)}
        </Svg>
      )}
    </View>
  );
}

/** A View with a linear-gradient background. Use `className` for radius/padding. */
export function GradientView({
  colors,
  diagonal = true,
  className,
  style,
  children,
}: {
  colors: Gradient;
  diagonal?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const id = useSvgId('g');
  return (
    <View className={className} style={[{ overflow: 'hidden' }, style]}>
      <FillSvg>
        {(w, h) => (
          <>
            <Defs>
              <LinearGradient id={id} x1="0" y1="0" x2={diagonal ? '1' : '0'} y2="1">
                {stops(colors)}
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={w} height={h} fill={`url(#${id})`} />
          </>
        )}
      </FillSvg>
      {children}
    </View>
  );
}

/** Soft translucent circles for hero backgrounds. Place inside a relative, overflow-hidden parent. */
export function Bubbles({ color = '#ffffff' }: { color?: string }) {
  return (
    <FillSvg>
      {(w, h) => (
        <>
          <Circle cx={w * 0.88} cy={h * 0.12} r={70} fill={color} opacity={0.12} />
          <Circle cx={w * 1.02} cy={h * 0.78} r={54} fill={color} opacity={0.1} />
          <Circle cx={w * 0.06} cy={h * 0.96} r={44} fill={color} opacity={0.08} />
          <Circle cx={w * 0.2} cy={h * 0.08} r={10} fill={color} opacity={0.18} />
          <Circle cx={w * 0.7} cy={h * 0.88} r={6} fill={color} opacity={0.22} />
        </>
      )}
    </FillSvg>
  );
}

/**
 * Duotone icon badge: rounded gradient tile with a soft coloured glow and a
 * glossy highlight, carrying a filled white glyph.
 */
export function GlowIcon({
  colors,
  icon,
  mci,
  size = 56,
  glow = true,
}: {
  colors: Gradient;
  icon?: IoniconName;
  mci?: McIconName;
  size?: number;
  glow?: boolean;
}) {
  const id = useSvgId('i');
  const pad = glow ? Math.round(size * 0.2) : 0;
  const total = size + pad * 2;
  const glyph = Math.round(size * 0.5);
  const glowColor = colors[colors.length - 1];

  return (
    <View style={{ width: total, height: total, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={total} height={total} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={`${id}f`} x1="0" y1="0" x2="1" y2="1">
            {stops(colors)}
          </LinearGradient>
          <RadialGradient id={`${id}g`} cx="50%" cy="56%" r="50%">
            <Stop offset="0.55" stopColor={glowColor} stopOpacity={0.4} />
            <Stop offset="1" stopColor={glowColor} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {glow && <Circle cx={total / 2} cy={total / 2} r={total / 2} fill={`url(#${id}g)`} />}
        <Rect x={pad} y={pad} width={size} height={size} rx={size * 0.34} fill={`url(#${id}f)`} />
        {/* glossy highlight */}
        <Rect
          x={pad + size * 0.12}
          y={pad + size * 0.08}
          width={size * 0.5}
          height={size * 0.22}
          rx={size * 0.11}
          fill="#ffffff"
          opacity={0.28}
        />
      </Svg>
      {mci ? (
        <MaterialCommunityIcons name={mci} size={glyph} color="#ffffff" />
      ) : (
        <Ionicons name={icon ?? 'sparkles'} size={glyph} color="#ffffff" />
      )}
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Circular progress ring with a gradient stroke that fills on mount. */
export function ScoreRing({
  value,
  max,
  colors,
  size = 180,
  stroke = 16,
  trackColor = 'rgba(255,255,255,0.25)',
  children,
}: {
  value: number;
  max: number;
  colors: Gradient;
  size?: number;
  stroke?: number;
  trackColor?: string;
  children?: React.ReactNode;
}) {
  const id = useSvgId('r');
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const fraction = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: fraction,
      duration: 1200,
      useNativeDriver: false,
    }).start();
  }, [fraction, progress]);

  const dashOffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={[StyleSheet.absoluteFill, { transform: [{ rotate: '-90deg' }] }]}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            {stops(colors)}
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
        />
      </Svg>
      {children}
    </View>
  );
}

/** Large gradient call-to-action with a matching coloured shadow. */
export function GradientButton({
  label,
  colors,
  onPress,
  icon,
  trailingIcon,
  disabled = false,
  loading = false,
}: {
  label: string;
  colors: Gradient;
  onPress: () => void;
  icon?: IoniconName;
  trailingIcon?: IoniconName;
  disabled?: boolean;
  loading?: React.ReactNode | false;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      disabled={disabled}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={{
        borderRadius: 20,
        shadowColor: colors[colors.length - 1],
        shadowOpacity: disabled ? 0 : 0.35,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: disabled ? 0 : 6,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <GradientView
        colors={colors}
        className="flex-row items-center justify-center gap-2 rounded-[20px] py-4 px-5"
      >
        {loading || (icon && <Ionicons name={icon} size={22} color="#ffffff" />)}
        <Text className="text-lg font-bold text-white">{label}</Text>
        {trailingIcon && <Ionicons name={trailingIcon} size={22} color="#ffffff" />}
      </GradientView>
    </TouchableOpacity>
  );
}

// Shared palettes
export const GRADIENTS = {
  ai: ['#4f46e5', '#7c3aed', '#c026d3'],
  aiSoft: ['#eef2ff', '#faf5ff'],
  primary: ['#3b82f6', '#6366f1'],
  sky: ['#38bdf8', '#2563eb'],
  amber: ['#fbbf24', '#f97316'],
  pink: ['#f472b6', '#db2777'],
  teal: ['#2dd4bf', '#0d9488'],
  violet: ['#a78bfa', '#7c3aed'],
  emerald: ['#34d399', '#059669'],
  rose: ['#fb7185', '#e11d48'],
  orange: ['#fdba74', '#ea580c'],
  slate: ['#94a3b8', '#475569'],
} as const satisfies Record<string, Gradient>;
