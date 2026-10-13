import React from 'react';
import { Image } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

// Reference figures for the MMSE "copy this drawing" item. The session picks
// one via `question.referenceAsset`; the original pentagons keep their bundled
// image, the alternates are drawn as clean line art.

const W = 220;
const H = 140;
const STROKE = { stroke: '#1e293b', strokeWidth: 3, strokeLinejoin: 'round' as const, fill: 'none' };

export const PENTAGON_CRITERIA = [
  'Both figures have five sides',
  'Both figures are convex',
  'Figures overlap each other',
  'Overlap creates a four-sided shape',
];

const LABELS: Record<string, string> = {
  pentagons: 'Two overlapping five-sided shapes',
  cube: 'A three-dimensional cube',
  overlapping_squares: 'Two overlapping squares',
  diamond_in_square: 'A diamond inside a square',
};

export function figureLabel(referenceAsset?: string) {
  return LABELS[referenceAsset ?? ''] ?? LABELS.pentagons;
}

export function ReferenceFigure({ referenceAsset }: { referenceAsset?: string }) {
  const label = figureLabel(referenceAsset);

  switch (referenceAsset) {
    case 'cube':
      return (
        <Svg width={W} height={H} viewBox="0 0 220 140" accessibilityLabel={label}>
          {/* front face, back face, and the four connecting edges */}
          <Rect x={55} y={45} width={75} height={75} {...STROKE} />
          <Rect x={95} y={15} width={75} height={75} {...STROKE} />
          <Path d="M55 45 L95 15 M130 45 L170 15 M130 120 L170 90 M55 120 L95 90" {...STROKE} />
        </Svg>
      );
    case 'overlapping_squares':
      return (
        <Svg width={W} height={H} viewBox="0 0 220 140" accessibilityLabel={label}>
          <Rect x={45} y={15} width={80} height={80} {...STROKE} />
          <Rect x={95} y={45} width={80} height={80} {...STROKE} />
        </Svg>
      );
    case 'diamond_in_square':
      return (
        <Svg width={W} height={H} viewBox="0 0 220 140" accessibilityLabel={label}>
          <Rect x={52} y={12} width={116} height={116} {...STROKE} />
          <Path d="M110 12 L168 70 L110 128 L52 70 Z" {...STROKE} />
        </Svg>
      );
    case 'pentagons':
    default:
      // Must match the exact MMSE pentagon diagram - two overlapping convex
      // pentagons whose intersection creates a four-sided figure.
      return (
        <Image
          source={require('@/assets/images/cognitive/mmse_pentagons.png')}
          style={{ width: W, height: H }}
          resizeMode="contain"
          accessibilityLabel={label}
        />
      );
  }
}
