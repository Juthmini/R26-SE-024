import React from 'react';
import Svg, { Circle, Ellipse, G, Path, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';

type Props = { size?: number };

export function RememberArt({ size = 96 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Defs>
        <LinearGradient id="rg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#60a5fa" />
          <Stop offset="1" stopColor="#2563eb" />
        </LinearGradient>
      </Defs>
      <Circle cx="60" cy="60" r="56" fill="#dbeafe" />
      <Rect x="22" y="40" width="76" height="52" rx="12" fill="url(#rg)" />
      <Rect x="44" y="30" width="30" height="14" rx="5" fill="#1d4ed8" />
      <Circle cx="60" cy="66" r="17" fill="#eff6ff" />
      <Circle cx="60" cy="66" r="10" fill="#1e3a8a" />
      <Circle cx="64" cy="62" r="3.5" fill="#fff" />
      <Rect x="80" y="48" width="10" height="6" rx="3" fill="#bfdbfe" />
      {/* detection box corners */}
      <Path d="M14 22 h10 M14 22 v10 M106 22 h-10 M106 22 v10 M14 104 h10 M14 104 v-10 M106 104 h-10 M106 104 v-10"
        stroke="#f59e0b" strokeWidth="4" strokeLinecap="round" />
      <Path d="M98 18 l3 6 6 3 -6 3 -3 6 -3 -6 -6 -3 6 -3z" fill="#fbbf24" />
    </Svg>
  );
}

export function VoiceArt({ size = 96 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Circle cx="60" cy="60" r="56" fill="#ede9fe" />
      <Rect x="46" y="22" width="28" height="48" rx="14" fill="#7c3aed" />
      <Rect x="52" y="30" width="5" height="22" rx="2.5" fill="#c4b5fd" />
      <Path d="M36 58 a24 24 0 0 0 48 0" stroke="#7c3aed" strokeWidth="6" fill="none" strokeLinecap="round" />
      <Rect x="57" y="82" width="6" height="14" rx="3" fill="#7c3aed" />
      <Rect x="44" y="94" width="32" height="6" rx="3" fill="#7c3aed" />
      <Path d="M20 50 q-6 10 0 20 M28 44 q-10 16 0 32" stroke="#a78bfa" strokeWidth="4" fill="none" strokeLinecap="round" />
      <Path d="M100 50 q6 10 0 20 M92 44 q10 16 0 32" stroke="#a78bfa" strokeWidth="4" fill="none" strokeLinecap="round" />
    </Svg>
  );
}

export function MapArt({ size = 96 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Circle cx="60" cy="60" r="56" fill="#dcfce7" />
      <Path d="M18 36 L44 26 L76 38 L102 28 L102 88 L76 98 L44 86 L18 96 Z" fill="#fff" stroke="#16a34a" strokeWidth="3" strokeLinejoin="round" />
      <Path d="M44 26 L44 86 M76 38 L76 98" stroke="#86efac" strokeWidth="3" />
      <Path d="M26 70 q14 -10 26 0 t28 -6 t18 4" stroke="#22c55e" strokeWidth="3" fill="none" strokeDasharray="5 5" />
      <G>
        <Path d="M74 22 c-11 0 -18 8 -18 17 c0 12 18 30 18 30 s18 -18 18 -30 c0 -9 -7 -17 -18 -17z" fill="#ef4444" />
        <Circle cx="74" cy="39" r="7" fill="#fff" />
      </G>
    </Svg>
  );
}

export function PeopleArt({ size = 96 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Circle cx="60" cy="60" r="56" fill="#ffedd5" />
      <Circle cx="44" cy="46" r="14" fill="#fdba74" />
      <Path d="M20 92 c0 -18 11 -28 24 -28 s24 10 24 28z" fill="#f97316" />
      <Circle cx="78" cy="50" r="12" fill="#fcd34d" />
      <Path d="M58 92 c0 -15 9 -24 20 -24 s20 9 20 24z" fill="#f59e0b" />
      <Path d="M90 22 c-4 -6 -12 -2 -10 4 c1 4 10 10 10 10 s9 -6 10 -10 c2 -6 -6 -10 -10 -4z" fill="#ef4444" />
    </Svg>
  );
}

export function StoryArt({ size = 96 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Circle cx="60" cy="60" r="56" fill="#fce7f3" />
      <Path d="M60 38 C48 30 30 30 20 34 L20 92 C30 88 48 88 60 96 Z" fill="#fff" stroke="#db2777" strokeWidth="3" strokeLinejoin="round" />
      <Path d="M60 38 C72 30 90 30 100 34 L100 92 C90 88 72 88 60 96 Z" fill="#fff" stroke="#db2777" strokeWidth="3" strokeLinejoin="round" />
      <Path d="M28 48 h22 M28 58 h22 M28 68 h16" stroke="#f9a8d4" strokeWidth="4" strokeLinecap="round" />
      <Path d="M80 52 c-5 -8 -16 -3 -13 5 c2 5 13 13 13 13 s11 -8 13 -13 c3 -8 -8 -13 -13 -5z" fill="#ec4899" />
      <Path d="M92 18 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="#f472b6" />
    </Svg>
  );
}

export function PhoneCamArt({ size = 40 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Rect x="13" y="4" width="22" height="40" rx="5" fill="#0f172a" />
      <Rect x="16" y="9" width="16" height="28" rx="2" fill="#60a5fa" />
      <Circle cx="24" cy="40.5" r="1.8" fill="#94a3b8" />
      <Circle cx="24" cy="23" r="5" fill="#1e3a8a" />
    </Svg>
  );
}

export function Esp32Art({ size = 40 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Rect x="8" y="8" width="32" height="32" rx="4" fill="#0f766e" />
      <Path d="M8 14 h-4 M8 22 h-4 M8 30 h-4 M40 14 h4 M40 22 h4 M40 30 h4" stroke="#94a3b8" strokeWidth="2" />
      <Circle cx="24" cy="22" r="8" fill="#0f172a" />
      <Circle cx="24" cy="22" r="4" fill="#38bdf8" />
      <Rect x="14" y="33" width="20" height="3" rx="1.5" fill="#5eead4" />
    </Svg>
  );
}

export function EmptyBoxArt({ size = 120 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Ellipse cx="60" cy="100" rx="40" ry="6" fill="#e2e8f0" />
      <Path d="M24 48 L60 34 L96 48 L96 88 L60 100 L24 88 Z" fill="#fde68a" />
      <Path d="M24 48 L60 62 L96 48 M60 62 L60 100" stroke="#f59e0b" strokeWidth="3" fill="none" />
      <Path d="M24 48 L12 36 L48 22 L60 34 Z M96 48 L108 36 L72 22 L60 34 Z" fill="#fcd34d" />
      <Circle cx="60" cy="18" r="6" fill="#93c5fd" />
      <Circle cx="78" cy="12" r="3" fill="#bfdbfe" />
    </Svg>
  );
}
