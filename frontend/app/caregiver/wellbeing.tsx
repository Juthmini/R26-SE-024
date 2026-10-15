import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  ScrollView, StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import ConfettiCannon from 'react-native-confetti-cannon';
import { Colors } from '../../src/constants/colors';
import { AiCoachCard } from '../../src/components/caregiver/insights/AiCoachCard';
import { fetchPersonalizedCoach } from '../../src/services/caregiver/llmService';
import {
  getRecommendationPriorities,
  submitFeedback,
} from '../../src/services/caregiver/recommendationService';
import { BurnoutRisk, CheckInResult, DailyCheckIn } from '../../src/types/caregiver.types';
import {
  generateRecommendations,
  getSummaryMessage,
  SmartRecommendation,
} from '../../src/utils/recommendationEngine';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Haptics helpers (fail silently on unsupported platforms) ───────────────
const hapticTap = () => {
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
};

// ── Priority badge config ──────────────────────────────────────────────────
const PRIORITY_CONFIG = {
  High: { label: 'High Priority', color: '#EF4444', bg: '#FEF2F2' },
  Medium: { label: 'Medium Priority', color: '#F97316', bg: '#FFF7ED' },
  Low: { label: 'Low Priority', color: '#22C55E', bg: '#F0FDF4' },
};

const PRIORITY_ICON: Record<'High' | 'Medium' | 'Low', string> = {
  High: 'flame',
  Medium: 'alert-circle',
  Low: 'leaf',
};

// ── Blob: a soft, organic breathing shape used for every icon/mascot ──────
// Purely presentational — no data, no logic, just a gently pulsing container.
const Blob: React.FC<{
  size: number;
  color: string;
  children?: React.ReactNode;
}> = ({ size, color, children }) => {
  const scale = useSharedValue(1);
  const rotate = useSharedValue(-3);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.07, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, false,
    );
    rotate.value = withRepeat(
      withSequence(
        withTiming(3, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
        withTiming(-3, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, true,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: size, height: size,
          backgroundColor: color,
          borderTopLeftRadius: size * 0.55,
          borderTopRightRadius: size * 0.4,
          borderBottomLeftRadius: size * 0.4,
          borderBottomRightRadius: size * 0.55,
          alignItems: 'center',
          justifyContent: 'center',
        },
        animStyle,
      ]}
    >
      {children}
    </Animated.View>
  );
};

// ── StatChip: small translucent pill for the hero's quick stats row ───────
const StatChip: React.FC<{ icon: string; label: string; value: string; delay?: number }> = ({
  icon, label, value, delay = 0,
}) => (
  <Animated.View
    entering={FadeInUp.delay(delay).springify().damping(14)}
    style={{
      flex: 1,
      backgroundColor: 'rgba(255,255,255,0.22)',
      borderRadius: 16,
      paddingVertical: 10,
      alignItems: 'center',
      gap: 2,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.3)',
    }}
  >
    <Ionicons name={icon as any} size={15} color={Colors.white} />
    <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.white }}>{value}</Text>
    <Text style={{ fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.85)' }}>{label}</Text>
  </Animated.View>
);

// ── Story walkthrough: "watch instead of read" mode ────────────────────────
// Turns a recommendation's text into a sequence of full-screen animated
// slides — one idea per screen, auto-advancing, tap left/right to navigate.
type StorySlide = {
  kind: 'cause' | 'reason' | 'step' | 'benefit';
  label: string;
  icon: string;   // small accessory badge icon
  emoji: string;  // theme emoji for the floating ambient particles
  color: string;  // vivid signature color for the icon blob
  text: string;
};

type ContentTheme = { icon: string; emoji: string; color: string };

// One row per topic: a test against the lowercased text, plus the
// icon/emoji/colour to use when it matches. A vivid, distinct colour per
// topic (water=blue, sleep=indigo, physical=orange, emotional=pink, etc.)
// is what actually makes the icon "colourful" rather than a plain white
// glyph — the icon graphic itself stays white on top of this colour so it
// stays legible no matter what the card's overall background colour is.
const CONTENT_RULES: Array<{ test: (t: string) => boolean; icon: string; emoji: string; color: string }> = [
  { test: (t) => t.includes('breath'), icon: 'cloud-outline', emoji: '🌬️', color: '#38BDF8' },
  { test: (t) => t.includes('water') || t.includes('hydrat') || t.includes('drink'), icon: 'water-outline', emoji: '💧', color: '#3B82F6' },
  { test: (t) => t.includes('sleep') || t.includes('slept') || t.includes('bedtime') || t.includes('nap'), icon: 'moon-outline', emoji: '😴', color: '#818CF8' },
  // Checked early and specifically so "physical tiredness/fatigue/exhaustion"
  // wins over a later, incidental mention of "emotional" in the same paragraph.
  { test: (t) => t.includes('physical'), icon: 'body-outline', emoji: '💪', color: '#FB923C' },
  { test: (t) => t.includes('walk') || t.includes('outside') || t.includes('outdoor') || t.includes('fresh air'), icon: 'walk-outline', emoji: '🚶', color: '#34D399' },
  { test: (t) => t.includes('journal') || t.includes('write down') || t.includes('write briefly') || t.includes('note down'), icon: 'pencil-outline', emoji: '📝', color: '#A78BFA' },
  { test: (t) => t.includes('counsellor') || t.includes('counselor') || t.includes('counselling') || t.includes('psychologist') || t.includes('therapist') || t.includes('professional') || t.includes('mental health') || t.includes('gp about'), icon: 'medkit-outline', emoji: '🩺', color: '#2DD4BF' },
  { test: (t) => t.includes('helpline') || t.includes('telephone') || t.includes('call '), icon: 'call-outline', emoji: '📞', color: '#22D3EE' },
  { test: (t) => t.includes('supervisor') || t.includes('manager'), icon: 'briefcase-outline', emoji: '💼', color: '#D97706' },
  { test: (t) => t.includes('support group') || t.includes(' group'), icon: 'people-circle-outline', emoji: '🫂', color: '#C084FC' },
  { test: (t) => t.includes('family') || t.includes('friend') || t.includes('colleague') || t.includes('someone you trust'), icon: 'people-outline', emoji: '👥', color: '#FBBF24' },
  { test: (t) => t.includes('music'), icon: 'musical-notes-outline', emoji: '🎵', color: '#EC4899' },
  { test: (t) => t.includes('stretch') || t.includes('shoulder') || t.includes('neck roll') || t.includes('ankle') || t.includes('wrist'), icon: 'body-outline', emoji: '🧘', color: '#2DD4BF' },
  { test: (t) => t.includes('emotion') || t.includes('overwhelm') || t.includes('drained'), icon: 'heart-outline', emoji: '❤️', color: '#FB7185' },
  { test: (t) => t.includes('mood'), icon: 'happy-outline', emoji: '🙂', color: '#FDE047' },
  { test: (t) => t.includes('exhaust') || t.includes('fatigue') || t.includes('tired'), icon: 'battery-dead-outline', emoji: '🔋', color: '#F97316' },
  { test: (t) => t.includes('difficult') || t.includes('trauma') || t.includes('agitation'), icon: 'shield-outline', emoji: '🛡️', color: '#A78BFA' },
  { test: (t) => t.includes('pattern') || t.includes('trend') || t.includes('consecutive'), icon: 'trending-up-outline', emoji: '📈', color: '#FB923C' },
  { test: (t) => t.includes('break') || t.includes('step away') || t.includes('rest') || t.includes('recovery'), icon: 'cafe-outline', emoji: '☕', color: '#D97706' },
  { test: (t) => t.includes('meal') || t.includes('eat ') || t.includes('snack') || t.includes('nutrition') || t.includes('nutritious'), icon: 'restaurant-outline', emoji: '🍎', color: '#F87171' },
  { test: (t) => t.includes('delegate') || t.includes('priorit') || t.includes('defer') || t.includes('matrix') || t.includes('task') || t.includes('backlog'), icon: 'list-outline', emoji: '📋', color: '#60A5FA' },
  { test: (t) => t.includes('alarm') || t.includes('reminder'), icon: 'alarm-outline', emoji: '⏰', color: '#FACC15' },
];

// Classifies a piece of recommendation text into a matching {icon, emoji,
// color} theme, so "contact a counsellor" and "journal your feelings" — or
// two different "Why This Matters" paragraphs — get visually distinct
// treatment instead of one fixed icon for everything of that slide type.
// Returns null when nothing matches, so the caller can apply a sensible
// per-slide-kind fallback rather than one generic icon for every miss.
const classifyContent = (text: string): ContentTheme | null => {
  const t = text.toLowerCase();
  const rule = CONTENT_RULES.find((r) => r.test(t));
  return rule ? { icon: rule.icon, emoji: rule.emoji, color: rule.color } : null;
};

// Per-slide-kind fallback, only used when classifyContent finds no keyword
// match at all — keeps a sensible default without forcing every unmatched
// "Why This Matters" or "Payoff" slide to the same icon/colour regardless
// of kind.
const FALLBACK_THEME: Record<StorySlide['kind'], ContentTheme> = {
  cause: { icon: 'alert-circle', emoji: '⚠️', color: '#F87171' },
  reason: { icon: 'information-circle-outline', emoji: '💭', color: '#60A5FA' },
  step: { icon: 'checkmark-circle-outline', emoji: '✅', color: '#4ADE80' },
  benefit: { icon: 'trending-up-outline', emoji: '🌱', color: '#4ADE80' },
};

const themeFor = (kind: StorySlide['kind'], text: string): ContentTheme =>
  classifyContent(text) ?? FALLBACK_THEME[kind];

const buildSlides = (rec: SmartRecommendation): StorySlide[] => {
  const slides: StorySlide[] = [];

  const causeTheme = themeFor('cause', rec.primaryCause);
  // Badge icon stays the card's own category icon (moon for sleep, heart for
  // emotional, etc.) so the walkthrough is visually rooted in the specific
  // problem from the first slide; the floating particles and blob colour use
  // the more specific phrase-level theme.
  slides.push({ kind: 'cause', label: 'PRIMARY CAUSE', icon: rec.icon, emoji: causeTheme.emoji, color: causeTheme.color, text: rec.primaryCause });

  const reasonTheme = themeFor('reason', rec.reason);
  slides.push({ kind: 'reason', label: 'WHY THIS MATTERS', icon: reasonTheme.icon, emoji: reasonTheme.emoji, color: reasonTheme.color, text: rec.reason });

  rec.recommendations.forEach((r, i) => {
    const theme = themeFor('step', r);
    slides.push({
      kind: 'step',
      label: `STEP ${i + 1} OF ${rec.recommendations.length}`,
      icon: theme.icon,
      emoji: theme.emoji,
      color: theme.color,
      text: r,
    });
  });

  const benefitTheme = themeFor('benefit', rec.expectedBenefit);
  slides.push({ kind: 'benefit', label: 'THE PAYOFF', icon: benefitTheme.icon, emoji: benefitTheme.emoji, color: benefitTheme.color, text: rec.expectedBenefit });

  return slides;
};

const STORY_SLIDE_DURATION = 4500; // ms each slide stays before auto-advancing

const ProgressFill: React.FC<{ progress: SharedValue<number> }> = ({ progress }) => {
  const style = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  return <Animated.View style={[{ height: '100%', backgroundColor: Colors.white }, style]} />;
};

// ── Ambient floating particle — drifts upward and fades, looping forever.
// Can render as a plain dot OR as an emoji character, so the same motion
// system can show themed content (💧 for a hydration slide, 😴 for sleep),
// similar to the falling water droplets in the reference video. ───────────
const FloatingParticle: React.FC<{
  delay: number; offsetX: number; size: number; travel: number; color?: string; emoji?: string;
}> = ({ delay, offsetX, size, travel, color = 'rgba(255,255,255,0.55)', emoji }) => {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const duration = 3600 + Math.abs(offsetX) * 6;
    translateY.value = withDelay(
      delay,
      withRepeat(withTiming(-travel, { duration, easing: Easing.out(Easing.quad) }), -1, false),
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.85, { duration: duration * 0.15 }),
          withTiming(0.85, { duration: duration * 0.55 }),
          withTiming(0, { duration: duration * 0.3 }),
        ),
        -1, false,
      ),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX }, { translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (emoji) {
    return (
      <Animated.Text style={[{ position: 'absolute', bottom: 0, fontSize: size }, style]}>
        {emoji}
      </Animated.Text>
    );
  }

  return (
    <Animated.View
      style={[
        {
          position: 'absolute', bottom: 0,
          width: size, height: size, borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
};

// Ambient background particles for the full story slide — themed to match
// whatever the current slide is actually about (droplets for hydration,
// zzz for sleep, etc.), like the falling water droplets in the reference
// video. pointerEvents="none" so it never blocks taps.
const StoryBackgroundParticles: React.FC<{ emoji: string }> = ({ emoji }) => {
  const particles = [
    { left: '10%', size: 18, delay: 0, travel: 340 },
    { left: '24%', size: 14, delay: 900, travel: 300 },
    { left: '46%', size: 20, delay: 1700, travel: 380 },
    { left: '63%', size: 15, delay: 300, travel: 320 },
    { left: '80%', size: 18, delay: 1200, travel: 360 },
    { left: '91%', size: 13, delay: 2100, travel: 300 },
  ];
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, overflow: 'hidden' }}>
      {particles.map((p, i) => (
        <View key={i} style={{ position: 'absolute', bottom: 60, left: p.left as any }}>
          <FloatingParticle offsetX={0} size={p.size} delay={p.delay} travel={p.travel} emoji={emoji} />
        </View>
      ))}
    </View>
  );
};

// Layered soft shapes behind everything else — breaks up what would
// otherwise be one flat block of colour, giving the slide some depth
// without needing a gradient library. A mix of light (white) and dark
// (black) low-opacity circles at different sizes/positions reads as
// texture rather than a single flat fill.
const StoryBackgroundDecor: React.FC = () => (
  <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, overflow: 'hidden' }}>
    <View style={{
      position: 'absolute', top: -70, left: -60,
      width: 220, height: 220, borderRadius: 110,
      backgroundColor: 'rgba(255,255,255,0.10)',
    }} />
    <View style={{
      position: 'absolute', top: 120, right: -80,
      width: 200, height: 200, borderRadius: 100,
      backgroundColor: 'rgba(0,0,0,0.08)',
    }} />
    <View style={{
      position: 'absolute', bottom: 40, left: -50,
      width: 180, height: 180, borderRadius: 90,
      backgroundColor: 'rgba(0,0,0,0.07)',
    }} />
    <View style={{
      position: 'absolute', bottom: -90, right: -40,
      width: 240, height: 240, borderRadius: 120,
      backgroundColor: 'rgba(255,255,255,0.09)',
    }} />
    <View style={{
      position: 'absolute', top: '38%', left: '50%', marginLeft: -160,
      width: 320, height: 320, borderRadius: 160,
      backgroundColor: 'rgba(255,255,255,0.06)',
    }} />
  </View>
);

// A pulsing "ping" ring behind the icon — expands and fades on a loop,
// giving every slide's icon a subtle sense of life.
const IconHalo: React.FC<{ size: number; tint?: string; delayMs?: number }> = ({
  size, tint = 'rgba(255,255,255,0.7)', delayMs = 0,
}) => {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.55);

  useEffect(() => {
    scale.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(1.55, { duration: 1600, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 0 }),
        ),
        -1, false,
      ),
    );
    opacity.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(0, { duration: 1600, easing: Easing.out(Easing.ease) }),
          withTiming(0.55, { duration: 0 }),
        ),
        -1, false,
      ),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size, height: size, borderRadius: size / 2,
          borderWidth: 2, borderColor: tint,
        },
        style,
      ]}
    />
  );
};

// The full icon treatment for a story slide — breathing blob + pulsing halo,
// with the content-matched icon (moon for sleep, water drop for hydration,
// a phone for a call, etc.) shown directly inside a vividly-coloured blob
// (colour also comes from the content match, e.g. blue for water, orange
// for physical fatigue), plus a bouncy pop-in for action steps. The icon
// glyph itself stays white so it's always legible against the coloured
// blob, regardless of what colour the card's overall background is.
const SlideIcon: React.FC<{ kind: StorySlide['kind']; icon: string; color: string }> = ({
  kind, icon, color,
}) => {
  const pop = useSharedValue(kind === 'step' ? 0 : 1);

  useEffect(() => {
    if (kind === 'step') {
      pop.value = withSequence(
        withTiming(1.2, { duration: 260, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 160 }),
      );
    }
  }, []);

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  return (
    <Animated.View style={[{ alignItems: 'center', justifyContent: 'center' }, popStyle]}>
      <IconHalo size={132} tint="rgba(255,255,255,0.75)" />
      <IconHalo size={132} tint="rgba(255,255,255,0.35)" delayMs={800} />
      <Blob size={110} color={color}>
        <Ionicons name={icon as any} size={54} color={Colors.white} />
      </Blob>
    </Animated.View>
  );
};

const StoryModal: React.FC<{
  rec: SmartRecommendation;
  onClose: () => void;
}> = ({ rec, onClose }) => {
  const slides = buildSlides(rec);
  const [index, setIndex] = useState(0);
  const progress = useSharedValue(0);
  const isLast = index === slides.length - 1;
  const slide = slides[index];

  const goNext = () => {
    hapticTap();
    if (index >= slides.length - 1) {
      onClose();
      return;
    }
    setIndex((prev) => prev + 1);
  };

  const goPrev = () => {
    if (index === 0) return;
    hapticTap();
    setIndex((prev) => prev - 1);
  };

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: STORY_SLIDE_DURATION, easing: Easing.linear });
    const timer = setTimeout(() => {
      setIndex((prev) => {
        if (prev >= slides.length - 1) {
          onClose();
          return prev;
        }
        return prev + 1;
      });
    }, STORY_SLIDE_DURATION);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" />
      <View style={{ flex: 1, backgroundColor: rec.color }}>

        {/* Layered background shapes for depth, then floating particles on top */}
        <StoryBackgroundDecor />
        <StoryBackgroundParticles emoji={slide.emoji} />

        {/* Progress bar (one segment per slide) */}
        <View style={{
          flexDirection: 'row', gap: 4,
          paddingHorizontal: 16, paddingTop: 54,
        }}>
          {slides.map((_, i) => (
            <View
              key={i}
              style={{
                flex: 1, height: 3, borderRadius: 2,
                backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden',
              }}
            >
              {i < index && (
                <View style={{ width: '100%', height: '100%', backgroundColor: Colors.white }} />
              )}
              {i === index && <ProgressFill progress={progress} />}
            </View>
          ))}
        </View>

        {/* Close */}
        <TouchableOpacity
          onPress={onClose}
          style={{
            position: 'absolute', top: 56, right: 16, zIndex: 10,
            width: 34, height: 34, borderRadius: 17,
            backgroundColor: 'rgba(255,255,255,0.25)',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons name="close" size={18} color={Colors.white} />
        </TouchableOpacity>

        {/* Tap zones — left = back, right = forward */}
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={goPrev} />
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={goNext} />
        </View>

        {/* Slide content — icon appears first, then a glass card holding the label and text (staggered) */}
        <View
          key={index}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}
        >
          <Animated.View entering={FadeIn.duration(320)}>
            <SlideIcon kind={slide.kind} icon={slide.icon} color={slide.color} />
          </Animated.View>

          <Animated.View
            entering={FadeInUp.delay(160).duration(300)}
            style={{
              marginTop: 26,
              backgroundColor: 'rgba(255,255,255,0.14)',
              borderRadius: 24,
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
              paddingVertical: 20, paddingHorizontal: 22,
              alignItems: 'center',
            }}
          >
            <View style={{
              backgroundColor: 'rgba(255,255,255,0.22)',
              borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5,
              marginBottom: 16,
            }}>
              <Text style={{
                fontSize: 11, fontWeight: '800',
                color: Colors.white, letterSpacing: 0.6,
              }}>
                {slide.label}
              </Text>
            </View>

            <Text style={{
              fontSize: 22, fontWeight: '700', color: Colors.white,
              textAlign: 'center', lineHeight: 32,
            }}>
              {slide.text}
            </Text>
          </Animated.View>
        </View>

        {/* Bottom control */}
        {isLast ? (
          <TouchableOpacity
            onPress={onClose}
            style={{
              position: 'absolute', bottom: 50, alignSelf: 'center',
              backgroundColor: Colors.white, borderRadius: 999,
              paddingHorizontal: 28, paddingVertical: 13,
              flexDirection: 'row', alignItems: 'center', gap: 8,
            }}
          >
            <Ionicons name="checkmark" size={16} color={rec.color} />
            <Text style={{ fontSize: 14, fontWeight: '800', color: rec.color }}>Got it</Text>
          </TouchableOpacity>
        ) : (
          <View style={{
            position: 'absolute', bottom: 50, alignSelf: 'center',
            flexDirection: 'row', alignItems: 'center', gap: 6, opacity: 0.85,
          }}>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>
              Tap to continue
            </Text>
            <Ionicons name="chevron-forward" size={12} color="rgba(255,255,255,0.85)" />
          </View>
        )}
      </View>
    </Modal>
  );
};

// ── Recommendation Card ────────────────────────────────────────────────────
const RecCard: React.FC<{
  rec: SmartRecommendation;
  index: number;
  stressLevel: string;
  stressScore: number;
  onFeedback: (id: string, feedback: 'helpful' | 'not_helpful') => void;
  feedbackGiven: Record<string, string>;
}> = ({ rec, index, stressLevel, stressScore, onFeedback, feedbackGiven }) => {
  const [expanded, setExpanded] = useState(index === 0);
  const [loading, setLoading] = useState(false);
  const [storyVisible, setStoryVisible] = useState(false);
  const pConfig = PRIORITY_CONFIG[rec.priority];
  const given = feedbackGiven[rec.id];

  const rotateAnim = useSharedValue(index === 0 ? 1 : 0);

  useEffect(() => {
    rotateAnim.value = withTiming(expanded ? 1 : 0, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [expanded]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotateAnim.value * 180}deg` }],
  }));

  const handleFeedback = async (fb: 'helpful' | 'not_helpful') => {
    if (given) return;
    hapticTap();
    setLoading(true);
    await onFeedback(rec.id, fb);
    setLoading(false);
  };

  const toggleExpanded = () => {
    hapticTap();
    setExpanded(!expanded);
  };

  return (
    <Animated.View
      entering={FadeInUp.delay(index * 90).springify().damping(16)}
      style={{
        backgroundColor: Colors.white,
        borderRadius: 24, marginBottom: 14,
        overflow: 'hidden',
        borderWidth: 1, borderColor: rec.color + '22',
        shadowColor: rec.color,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.14, shadowRadius: 14, elevation: 3,
      }}
    >

      {/* ── Card Header (soft colour wash) ── */}
      <View style={{ backgroundColor: rec.bg }}>
        <TouchableOpacity
          onPress={toggleExpanded}
          style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 }}
          activeOpacity={0.85}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Blob size={52} color={rec.color}>
              <Ionicons name={rec.icon as any} size={24} color={Colors.white} />
            </Blob>

            <View style={{ flex: 1 }}>
              <Text style={{
                fontSize: 14, fontWeight: '800',
                color: Colors.textPrimary, marginBottom: 6,
              }}>
                {rec.title}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: pConfig.color,
                  paddingHorizontal: 9, paddingVertical: 3,
                  borderRadius: 999,
                }}>
                  <Ionicons name={PRIORITY_ICON[rec.priority] as any} size={9} color={Colors.white} />
                  <Text style={{
                    fontSize: 9, fontWeight: '800',
                    color: Colors.white, textTransform: 'uppercase',
                  }}>
                    {pConfig.label}
                  </Text>
                </View>
                <View style={{
                  backgroundColor: Colors.white,
                  paddingHorizontal: 9, paddingVertical: 3,
                  borderRadius: 999,
                  borderWidth: 1, borderColor: rec.color + '30',
                }}>
                  <Text style={{
                    fontSize: 9, fontWeight: '700', color: rec.color,
                  }}>
                    {rec.category}
                  </Text>
                </View>
              </View>
            </View>

            <Animated.View style={chevronStyle}>
              <Ionicons name="chevron-down" size={18} color={Colors.textMuted} />
            </Animated.View>
          </View>
        </TouchableOpacity>

        {/* ── Watch vs Read choice ── */}
        <TouchableOpacity
          onPress={() => { hapticTap(); setStoryVisible(true); }}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            marginHorizontal: 16, marginBottom: 14,
            backgroundColor: rec.color, borderRadius: 999, paddingVertical: 9,
          }}
        >
          <Ionicons name="play-circle" size={15} color={Colors.white} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.white }}>
            Watch Animated Walkthrough
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Expanded Content (read mode) ── */}
      {expanded && (
        <Animated.View entering={FadeIn.duration(220)} style={{ padding: 16, gap: 14 }}>

          {/* Primary Cause */}
          <View style={{
            backgroundColor: rec.bg,
            borderRadius: 16, padding: 14,
            flexDirection: 'row', alignItems: 'center', gap: 12,
          }}>
            <Blob size={36} color={Colors.white}>
              <Ionicons name="alert-circle" size={16} color={rec.color} />
            </Blob>
            <View style={{ flex: 1 }}>
              <Text style={{
                fontSize: 10, fontWeight: '700',
                color: rec.color, textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}>
                Primary Cause
              </Text>
              <Text style={{
                fontSize: 15, fontWeight: '800', color: rec.color, marginTop: 1,
              }}>
                {rec.primaryCause}
              </Text>
            </View>
          </View>

          {/* Reason */}
          <View>
            <View style={{
              flexDirection: 'row', gap: 6,
              alignItems: 'center', marginBottom: 6,
            }}>
              <Ionicons
                name="information-circle-outline"
                size={14} color={Colors.primary}
              />
              <Text style={{
                fontSize: 10, fontWeight: '700',
                color: Colors.primary, textTransform: 'uppercase',
              }}>
                Why This Was Recommended
              </Text>
            </View>
            <Text style={{
              fontSize: 12.5, color: Colors.textSecondary,
              lineHeight: 19,
            }}>
              {rec.reason}
            </Text>
          </View>

          {/* Recommendations list */}
          <View>
            <View style={{
              flexDirection: 'row', gap: 6,
              alignItems: 'center', marginBottom: 10,
            }}>
              <Ionicons
                name="checkmark-circle-outline"
                size={14} color={Colors.success}
              />
              <Text style={{
                fontSize: 10, fontWeight: '700',
                color: Colors.success, textTransform: 'uppercase',
              }}>
                What To Do Now
              </Text>
            </View>
            {rec.recommendations.map((r, i) => (
              <Animated.View
                key={i}
                entering={FadeInUp.delay(i * 60).duration(260)}
                style={{
                  flexDirection: 'row', gap: 10,
                  marginBottom: 10, alignItems: 'flex-start',
                }}
              >
                <View style={{
                  width: 22, height: 22, borderRadius: 11,
                  backgroundColor: rec.color,
                  alignItems: 'center', justifyContent: 'center',
                  marginTop: 1, flexShrink: 0,
                }}>
                  <Text style={{
                    fontSize: 10, fontWeight: '800', color: Colors.white,
                  }}>
                    {i + 1}
                  </Text>
                </View>
                <Text style={{
                  flex: 1, fontSize: 12.5,
                  color: Colors.textPrimary,
                  lineHeight: 19, fontWeight: '500',
                }}>
                  {r}
                </Text>
              </Animated.View>
            ))}
          </View>

          {/* Expected benefit */}
          <View style={{
            backgroundColor: Colors.successSoft,
            borderRadius: 14, padding: 12,
            flexDirection: 'row', gap: 10, alignItems: 'flex-start',
          }}>
            <Blob size={30} color={Colors.white}>
              <Ionicons name="trending-up-outline" size={14} color={Colors.success} />
            </Blob>
            <View style={{ flex: 1 }}>
              <Text style={{
                fontSize: 10, fontWeight: '700',
                color: Colors.success,
                textTransform: 'uppercase', marginBottom: 2,
              }}>
                Expected Benefit
              </Text>
              <Text style={{
                fontSize: 12, color: Colors.success, lineHeight: 17,
              }}>
                {rec.expectedBenefit}
              </Text>
            </View>
          </View>

          {/* Feedback */}
          <View style={{
            borderTopWidth: 1, borderTopColor: Colors.borderLight,
            paddingTop: 14,
          }}>
            <Text style={{
              fontSize: 12, color: Colors.textSecondary,
              marginBottom: 10, textAlign: 'center',
            }}>
              Was this recommendation helpful?
            </Text>

            {given ? (
              <Animated.View
                entering={FadeInUp.springify()}
                style={{
                  backgroundColor: given === 'helpful'
                    ? Colors.successSoft : Colors.dangerSoft,
                  borderRadius: 999, padding: 12,
                  alignItems: 'center', flexDirection: 'row',
                  justifyContent: 'center', gap: 6,
                }}
              >
                <Ionicons
                  name={given === 'helpful' ? 'checkmark-circle' : 'close-circle'}
                  size={16}
                  color={given === 'helpful' ? Colors.success : Colors.danger}
                />
                <Text style={{
                  fontSize: 12, fontWeight: '700',
                  color: given === 'helpful' ? Colors.success : Colors.danger,
                }}>
                  {given === 'helpful'
                    ? 'Marked as Helpful — we will prioritise this for you'
                    : 'Marked as Not Helpful — we will suggest alternatives next time'}
                </Text>
              </Animated.View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => handleFeedback('helpful')}
                  disabled={loading}
                  style={{
                    flex: 1, backgroundColor: Colors.successSoft,
                    borderRadius: 999, paddingVertical: 12,
                    alignItems: 'center', flexDirection: 'row',
                    justifyContent: 'center', gap: 6,
                    borderWidth: 1, borderColor: Colors.success + '40',
                  }}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={Colors.success} />
                  ) : (
                    <>
                      <Ionicons name="thumbs-up-outline" size={16} color={Colors.success} />
                      <Text style={{
                        fontSize: 12, fontWeight: '700', color: Colors.success,
                      }}>
                        Helpful
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleFeedback('not_helpful')}
                  disabled={loading}
                  style={{
                    flex: 1, backgroundColor: Colors.dangerSoft,
                    borderRadius: 999, paddingVertical: 12,
                    alignItems: 'center', flexDirection: 'row',
                    justifyContent: 'center', gap: 6,
                    borderWidth: 1, borderColor: Colors.danger + '40',
                  }}
                >
                  <Ionicons name="thumbs-down-outline" size={16} color={Colors.danger} />
                  <Text style={{
                    fontSize: 12, fontWeight: '700', color: Colors.danger,
                  }}>
                    Not Helpful
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </Animated.View>
      )}

      {storyVisible && (
        <StoryModal rec={rec} onClose={() => setStoryVisible(false)} />
      )}
    </Animated.View>
  );
};

// ── MAIN SCREEN ────────────────────────────────────────────────────────────
export default function WellbeingScreen() {
  const params = useLocalSearchParams();
  const stressLevel = (params.stressLevel as string) || 'Moderate';
  const stressScore = params.stressScore ? Number(params.stressScore) : 6;
  const formData = params.formData
    ? JSON.parse(params.formData as string) as DailyCheckIn
    : null;

  // Weekly trend / burnout context passed from insights.tsx — undefined if
  // this screen was opened without a check-in. Every rule that reads this
  // in recommendationEngine.ts is guarded, so nothing breaks.
  const weeklyContext: BurnoutRisk | undefined = params.burnout
    ? JSON.parse(params.burnout as string) as BurnoutRisk
    : undefined;

  const defaultForm: DailyCheckIn = {
    sleepHours: 6, physicalTiredness: 3, mood: 3,
    emotionalOverwhelm: 3, hoursCaregiving: 8,
    tasksAssigned: 10, tasksCompleted: 8,
    difficultSituations: 2, breaksTaken: 1,
    mentallyExhausted: 3, difficultyManaging: 3,
    emotionallyDrained: 3,
  };

  const form = formData || defaultForm;
  const result = {
    stressLevel: stressLevel as 'Low' | 'Moderate' | 'High',
    stressScore,
    confidence: 0.85,
    message: '',
    tips: [],
    submittedAt: new Date().toISOString(),
  } as CheckInResult;

  const [recs, setRecs] = useState<SmartRecommendation[]>([]);
  const [feedbackGiven, setFeedback] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // ── AI coach note (additive: if the AI is unavailable, nothing changes) ──
  const [coachMsg, setCoachMsg]         = useState<string | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);

  useEffect(() => {
    if (loading || recs.length === 0) return;
    let cancelled = false;
    (async () => {
      setCoachLoading(true);
      const out = await fetchPersonalizedCoach(stressLevel, stressScore, weeklyContext, recs);
      if (!cancelled) { setCoachMsg(out?.message ?? null); setCoachLoading(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, params.formData, params.stressLevel, params.burnout]);

  const stressConfig = {
    High: { color: '#EF4444', bg: '#FEF2F2', emoji: '😟' },
    Moderate: { color: '#F97316', bg: '#FFF7ED', emoji: '😐' },
    Low: { color: '#22C55E', bg: '#F0FDF4', emoji: '😊' },
  }[stressLevel] || { color: '#F97316', bg: '#FFF7ED', emoji: '😐' };

  useEffect(() => {
    loadRecommendations();
    // Re-run whenever the incoming check-in data actually changes, not just
    // on first mount — otherwise a reused screen instance (e.g. navigating
    // back and viewing a different check-in's plan) shows a stale action
    // plan while the hero/summary text above it correctly update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.formData, params.stressLevel, params.stressScore, params.burnout]);

  const loadRecommendations = async () => {
    setLoading(true);
    // ← ADD THIS DEBUG LINE
    console.log('Form data received:', JSON.stringify(form));
    console.log('Sleep hours:', form.sleepHours);
    console.log('Tasks assigned:', form.tasksAssigned);
    console.log('Tasks completed:', form.tasksCompleted);
    console.log('Weekly context received:', JSON.stringify(weeklyContext));
    try {
      // Load adaptive priorities from backend
      const { boosted, suppressed } = await getRecommendationPriorities();
      const generated = generateRecommendations(form, result, suppressed, boosted, weeklyContext);
      setRecs(generated);
    } catch {
      setRecs(generateRecommendations(form, result, [], [], weeklyContext));
    } finally {
      setLoading(false);
    }
  };

  const handleFeedback = async (
    id: string,
    feedback: 'helpful' | 'not_helpful',
  ) => {
    const rec = recs.find(r => r.id === id);
    if (!rec) return;

    setFeedback(prev => ({ ...prev, [id]: feedback }));

    await submitFeedback(rec, feedback, stressLevel, stressScore);

    // If not helpful — remove and reload alternatives
    if (feedback === 'not_helpful') {
      setTimeout(async () => {
        const { boosted, suppressed } = await getRecommendationPriorities();
        const fresh = generateRecommendations(form, result, suppressed, boosted, weeklyContext);
        setRecs(fresh);
      }, 1500);
    }
  };

  const summaryMessage = getSummaryMessage(form, result);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      {/* Header */}
      <View style={{
        backgroundColor: Colors.background,
        paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
        borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity
            onPress={() => router.replace('/caregiver/insights')}
            style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: Colors.borderLight,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Blob size={34} color={Colors.primaryLight}>
            <Ionicons name="sparkles" size={16} color={Colors.primary} />
          </Blob>
          <View>
            <Text style={{
              fontSize: 22, fontWeight: '800', color: Colors.textPrimary,
            }}>
              Smart Care Coach
            </Text>
            <Text style={{ fontSize: 12, color: Colors.textMuted }}>
              Personalised for your check-in today
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
      >
        {/* Stress hero — full-bleed colour, breathing mascot */}
        <Animated.View
          entering={FadeIn.duration(420)}
          style={{
            backgroundColor: stressConfig.color,
            borderRadius: 28, padding: 20, marginBottom: 18,
            overflow: 'hidden',
          }}
        >
          {/* decorative translucent circles */}
          <View style={{
            position: 'absolute', top: -30, right: -30,
            width: 120, height: 120, borderRadius: 60,
            backgroundColor: 'rgba(255,255,255,0.12)',
          }} />
          <View style={{
            position: 'absolute', bottom: -40, left: -20,
            width: 100, height: 100, borderRadius: 50,
            backgroundColor: 'rgba(255,255,255,0.08)',
          }} />
          <View style={{
            position: 'absolute', top: 40, left: -35,
            width: 70, height: 70, borderRadius: 35,
            backgroundColor: 'rgba(0,0,0,0.06)',
          }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <IconHalo size={94} tint="rgba(255,255,255,0.7)" />
              <Blob size={78} color="rgba(255,255,255,0.25)">
                <Text style={{ fontSize: 34 }}>{stressConfig.emoji}</Text>
              </Blob>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{
                alignSelf: 'flex-start',
                backgroundColor: 'rgba(255,255,255,0.25)',
                borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3,
                marginBottom: 6,
              }}>
                <Text style={{
                  fontSize: 10, fontWeight: '800',
                  color: Colors.white, letterSpacing: 0.5,
                }}>
                  TODAY'S STRESS LEVEL
                </Text>
              </View>
              <Text style={{
                fontSize: 30, fontWeight: '900', color: Colors.white,
              }}>
                {stressLevel}
              </Text>
              <Text style={{
                fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2,
              }}>
                Score: {stressScore}/10
              </Text>
            </View>
          </View>

          {/* Quick stats */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
            <StatChip
              icon="checkmark-done-outline"
              label="Tasks"
              value={`${form.tasksCompleted}/${form.tasksAssigned}`}
              delay={80}
            />
            <StatChip
              icon="moon-outline"
              label="Sleep"
              value={`${form.sleepHours}h`}
              delay={140}
            />
            <StatChip
              icon="cafe-outline"
              label="Breaks"
              value={`${form.breaksTaken}`}
              delay={200}
            />
          </View>
        </Animated.View>

        {/* Personalised analysis */}
        <Animated.View
          entering={FadeInUp.delay(100)}
          style={{
            backgroundColor: Colors.primaryLight, borderRadius: 20,
            padding: 16, marginBottom: 20,
            borderLeftWidth: 4, borderLeftColor: Colors.primary,
            flexDirection: 'row', gap: 12, alignItems: 'flex-start',
          }}
        >
          <Blob size={36} color={Colors.primary}>
            <Ionicons name="analytics-outline" size={16} color={Colors.white} />
          </Blob>
          <View style={{ flex: 1 }}>
            <Text style={{
              fontSize: 11, fontWeight: '700',
              color: Colors.primary, textTransform: 'uppercase',
              marginBottom: 4,
            }}>
              Personalised Analysis
            </Text>
            <Text style={{
              fontSize: 13, color: Colors.textSecondary, lineHeight: 20,
            }}>
              {summaryMessage}
            </Text>
          </View>
        </Animated.View>

        {/* Recommendations header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: 14,
        }}>
          <Text style={{
            fontSize: 17, fontWeight: '800', color: Colors.textPrimary,
          }}>
            Your Action Plan
          </Text>
          {recs.length > 0 && (
            <View style={{
              backgroundColor: Colors.primary,
              paddingHorizontal: 12, paddingVertical: 5,
              borderRadius: 999,
            }}>
              <Text style={{
                fontSize: 11, fontWeight: '700', color: Colors.white,
              }}>
                {recs.length} actions
              </Text>
            </View>
          )}
        </View>

        <AiCoachCard loading={coachLoading} message={coachMsg} />

        {/* Loading */}
        {loading ? (
          <View style={{ alignItems: 'center', padding: 40 }}>
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <IconHalo size={84} tint={Colors.primary + '55'} />
              <Blob size={64} color={Colors.primaryLight}>
                <Ionicons name="hourglass-outline" size={26} color={Colors.primary} />
              </Blob>
            </View>
            <Text style={{
              fontSize: 13, color: Colors.textMuted, marginTop: 16,
            }}>
              Personalising recommendations...
            </Text>
          </View>
        ) : recs.length === 0 ? (
          <Animated.View
            entering={FadeIn}
            style={{
              backgroundColor: Colors.successSoft,
              borderRadius: 24, padding: 28, alignItems: 'center',
              overflow: 'hidden',
            }}
          >
            {/* decorative background circles for depth */}
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}>
              <View style={{
                position: 'absolute', top: -40, right: -30,
                width: 140, height: 140, borderRadius: 70,
                backgroundColor: 'rgba(34,197,94,0.08)',
              }} />
              <View style={{
                position: 'absolute', bottom: -50, left: -30,
                width: 150, height: 150, borderRadius: 75,
                backgroundColor: 'rgba(34,197,94,0.06)',
              }} />
            </View>
            <ConfettiCannon
              count={70}
              origin={{ x: SCREEN_WIDTH / 2, y: 0 }}
              fadeOut
              autoStart
              fallSpeed={2800}
            />
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <IconHalo size={96} tint={Colors.success + '55'} />
              <Blob size={72} color={Colors.white}>
                <Text style={{ fontSize: 34 }}>🎉</Text>
              </Blob>
            </View>
            <Text style={{
              fontSize: 17, fontWeight: '800', color: Colors.success, marginTop: 14,
            }}>
              All done!
            </Text>
            <Text style={{
              fontSize: 13, color: Colors.textSecondary,
              textAlign: 'center', marginTop: 4,
            }}>
              You have completed all your recommended actions for today!
            </Text>
          </Animated.View>
        ) : (
          recs.map((rec, i) => (
            <RecCard
              key={rec.id}
              rec={rec}
              index={i}
              stressLevel={stressLevel}
              stressScore={stressScore}
              onFeedback={handleFeedback}
              feedbackGiven={feedbackGiven}
            />
          ))
        )}

        {/* Adaptive learning note */}
        {recs.length > 0 && (
          <Animated.View
            entering={FadeInUp.delay(recs.length * 90 + 100)}
            style={{
              backgroundColor: Colors.primaryLight,
              borderRadius: 18, padding: 14,
              flexDirection: 'row', gap: 12,
              alignItems: 'center', marginTop: 4,
            }}
          >
            <Blob size={32} color={Colors.white}>
              <Ionicons name="bulb-outline" size={15} color={Colors.primary} />
            </Blob>
            <Text style={{
              flex: 1, fontSize: 11,
              color: Colors.primary, lineHeight: 16,
            }}>
              Your feedback helps personalise future recommendations.
              Helpful ratings increase priority, Not Helpful ratings
              suggest alternatives next time.
            </Text>
          </Animated.View>
        )}

        {/* Back button */}
        <TouchableOpacity
          onPress={() => router.replace('/caregiver/insights')}
          style={{
            backgroundColor: Colors.primary,
            borderRadius: 999, paddingVertical: 15,
            alignItems: 'center', marginTop: 18,
            flexDirection: 'row', justifyContent: 'center', gap: 8,
          }}
        >
          <Ionicons name="arrow-back-circle-outline" size={18} color={Colors.white} />
          <Text style={{
            fontSize: 14, fontWeight: '700', color: Colors.white,
          }}>
            Back to Insights
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}