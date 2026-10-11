import React from 'react';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

export type DayPart = 'morning' | 'day' | 'evening' | 'night';

export function dayPart(d = new Date()): DayPart {
  const h = d.getHours();
  return h < 6 ? 'night' : h < 11 ? 'morning' : h < 16 ? 'day' : h < 19 ? 'evening' : 'night';
}

// Sky and land colours follow the real time of day, so the screen itself
// gently tells the patient whether it is morning, afternoon or night.
const SKY: Record<DayPart, { top: string; bottom: string; sun: string; glow: string; far: string; mid: string;
  near: string; ground: string; window: string }> = {
  morning: { top: '#8EC9E8', bottom: '#FCE6B8', sun: '#FFE08A', glow: '#FFF3C4', far: '#7FA88A', mid: '#5E9A5C', near: '#4C8A4A', ground: '#3F7A3D', window: '#BFE3F2' },
  day: { top: '#5FB2E6', bottom: '#CDEBF7', sun: '#FFF2A8', glow: '#FFFBE0', far: '#6E9E7E', mid: '#4F9150', near: '#3F8240', ground: '#367337', window: '#BFE3F2' },
  evening: { top: '#5B6FA8', bottom: '#F6B27A', sun: '#FF9E5E', glow: '#FFD3A8', far: '#6A7F79', mid: '#4D6E4F', near: '#3E5F41', ground: '#33533A', window: '#FFD27A' },
  night: { top: '#0E1B33', bottom: '#2B3D63', sun: '#F4F1DE', glow: '#5A6B92', far: '#2D3F4A', mid: '#22362F', near: '#1C2E28', ground: '#172722', window: '#FFC85C' },
};

function Palm({ x, y, s = 1, color }: { x: number; y: number; s?: number; color: string }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      <Path d="M0 0 C 4 -30 2 -60 10 -88" stroke="#6B4F36" strokeWidth="5" fill="none" strokeLinecap="round" />
      <Path d="M10 -88 C -10 -96 -30 -88 -38 -74 C -22 -82 -6 -84 10 -88 Z" fill={color} />
      <Path d="M10 -88 C 30 -98 50 -92 58 -78 C 42 -84 26 -86 10 -88 Z" fill={color} />
      <Path d="M10 -88 C 0 -104 -18 -110 -30 -106 C -14 -102 0 -96 10 -88 Z" fill={color} />
      <Path d="M10 -88 C 22 -106 40 -110 50 -104 C 36 -100 22 -96 10 -88 Z" fill={color} />
      <Path d="M10 -88 C 14 -76 10 -62 4 -54 C 8 -66 9 -78 10 -88 Z" fill={color} />
      <Circle cx="8" cy="-84" r="3.5" fill="#7A5A2E" />
      <Circle cx="14" cy="-83" r="3.5" fill="#7A5A2E" />
    </G>
  );
}

export default function HeroScene({ width, height, part, bg }: { width: number; height: number; part: DayPart; bg: string }) {
  const c = SKY[part];
  const night = part === 'night';
  return (
    <Svg width={width} height={height} viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id={`sky-${part}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.top} />
          <Stop offset="1" stopColor={c.bottom} />
        </LinearGradient>
        <LinearGradient id={`shade-${part}`} x1="0" y1="0" x2="1" y2="0.6">
          <Stop offset="0" stopColor="#000" stopOpacity={night ? 0.25 : 0.38} />
          <Stop offset="0.6" stopColor="#000" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="400" height="300" fill={`url(#sky-${part})`} />

      {night && [[40, 40], [90, 22], [150, 50], [200, 18], [240, 60], [120, 85], [365, 30], [60, 110]].map(([x, y], i) => (
        <Circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.8 : 1.2} fill="#FFFFFF" opacity={0.85} />
      ))}
      <Circle cx="318" cy={part === 'evening' ? 150 : 72} r="46" fill={c.glow} opacity={0.45} />
      {night
        ? <Path d="M318 44 a28 28 0 1 0 22 46 a22 22 0 1 1 -22 -46 z" fill={c.sun} />
        : <Circle cx="318" cy={part === 'evening' ? 150 : 72} r="28" fill={c.sun} />}
      {!night && <Path d="M120 70 l7 5 l7 -5 M146 58 l5 4 l5 -4" stroke="#33465A" strokeWidth="2" fill="none" strokeLinecap="round" opacity={0.55} />}

      {!night && (
        <G opacity={part === 'evening' ? 0.55 : 0.9}>
          <Path d="M40 92 q8 -16 26 -12 q10 -14 28 -4 q16 -2 18 12 q4 12 -12 12 h-54 q-14 0 -6 -8z" fill="#FFFFFF" />
          <Path d="M196 56 q6 -12 20 -9 q8 -10 21 -3 q12 -1 13 9 q3 9 -9 9 h-40 q-11 0 -5 -6z" fill="#FFFFFF" opacity={0.85} />
        </G>
      )}
      <Path d="M150 170 L198 112 L214 124 L232 104 L292 170 Z" fill={c.far} opacity={0.55} />
      {/* hills and paddy terraces */}
      <Path d="M0 178 Q 70 140 150 168 T 300 150 T 400 162 V300 H0 Z" fill={c.far} />
      <Path d="M0 208 Q 110 176 210 204 T 400 194 V300 H0 Z" fill={c.mid} />
      <Path d="M-10 222 Q 110 200 220 222 M-10 236 Q 120 214 230 236 M 160 214 Q 280 196 410 210" stroke={c.near} strokeWidth="3" fill="none" opacity={0.7} />

      {/* the patient's home */}
      <G>
        <Rect x="238" y="186" width="88" height="44" fill={night ? '#B9A58C' : '#F1E3CC'} />
        <Path d="M228 190 L282 156 L336 190 Z" fill={night ? '#7A3B2A' : '#B4513A'} />
        <Path d="M228 190 L336 190" stroke="#6E2F21" strokeWidth="2" />
        <Rect x="276" y="204" width="14" height="26" rx="2" fill="#6B4F36" />
        <Rect x="248" y="198" width="16" height="13" rx="2" fill={c.window} />
        <Rect x="302" y="198" width="16" height="13" rx="2" fill={c.window} />
        <Path d="M256 198 v13 M310 198 v13" stroke={night ? '#E3A73C' : '#9CC6D8'} strokeWidth="1.5" />
        {night && <Circle cx="283" cy="226" r="18" fill="#FFC85C" opacity={0.16} />}
      </G>
      <Path d="M0 246 Q 200 222 400 246 V300 H0 Z" fill={c.ground} />
      <Path d="M-10 262 Q 120 240 210 256 M-10 278 Q 110 256 200 272 M250 262 Q 330 248 410 258" stroke={c.mid} strokeWidth="4" fill="none" opacity={0.8} />
      <Path d="M283 230 C 276 248 244 262 214 300" stroke={night ? '#5E5340' : '#E8D5A8'} strokeWidth="11" fill="none" strokeLinecap="round" />
      <G fill={night ? '#1E3B2A' : '#2F6B36'}>
        <Circle cx="232" cy="226" r="9" /><Circle cx="242" cy="222" r="7" /><Circle cx="334" cy="226" r="9" /><Circle cx="344" cy="230" r="7" />
      </G>
      <Palm x={78} y={250} s={1} color={night ? '#1E3B2A' : '#2F6B36'} />
      <Palm x={372} y={244} s={0.85} color={night ? '#1E3B2A' : '#2F6B36'} />
      <Palm x={200} y={246} s={0.55} color={night ? '#22412F' : '#3B7B40'} />

      {/* legibility shade behind the greeting, and the curved edge into the page */}
      <Rect x="0" y="0" width="400" height="300" fill={`url(#shade-${part})`} />
      <Path d="M0 272 Q 200 318 400 272 V300 H0 Z" fill={bg} />
    </Svg>
  );
}
