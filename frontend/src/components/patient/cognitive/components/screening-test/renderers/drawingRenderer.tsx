import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  Canvas,
  Path,
  Skia,
  SkPath,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Question } from '@/src/types/assessment.types';
import { Ionicons } from '@expo/vector-icons';
import { CARD_SHADOW, InfoCard, VerdictButtons } from '../assessmentUi';
import { PENTAGON_CRITERIA, ReferenceFigure } from './referenceFigures';

interface DrawnPath {
  path: SkPath;
  color: string;
  strokeWidth: number;
}

interface Props {
  question: Question;
  onAnswer: (passed: boolean) => void;
}

export function DrawingRenderer({ question, onAnswer }: Props) {
  const [paths, setPaths] = useState<DrawnPath[]>([]);
  const [currentPath, setCurrentPath] = useState<SkPath | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [CaregiverMarked, setCaregiverMarked] = useState<boolean | null>(null);

  // ── Gesture: finger down → start a new path ──────────────────
  const pan = Gesture.Pan()
    .runOnJS(true)
    .onBegin((e) => {
      const path = Skia.Path.Make();
      path.moveTo(e.x, e.y);
      setCurrentPath(path);
      setHasDrawn(true);
    })
    .onUpdate((e) => {
      if (!currentPath) return;
      const updated = currentPath.copy();
      updated.lineTo(e.x, e.y);
      setCurrentPath(updated);
    })
    .onEnd(() => {
      if (!currentPath) return;
      setPaths(prev => [
        ...prev,
        {
          path: currentPath,
          color: '#1e293b',   // dark slate - clear on white canvas
          strokeWidth: 2.5,
        },
      ]);
      setCurrentPath(null);
    });

  // ── Clear all strokes ─────────────────────────────────────────
  const handleClear = () => {
    setPaths([]);
    setCurrentPath(null);
    setHasDrawn(false);
    setCaregiverMarked(null);
    onAnswer(false);
  };

  // ── Caregiver marks pass or fail ──────────────────────────────
  // Per MMSE rules, scoring requires human judgement:
  // ✓ Two convex five-sided figures
  // ✓ They intersect/overlap
  // ✓ Intersection forms a four-sided figure
  const handleMark = (passed: boolean) => {
    setCaregiverMarked(passed);
    onAnswer(passed);
  };

  return (
    <View className="px-6 gap-5">

      {/* Reference figure - rotates per session (pentagons, cube, ...) */}
      <View className="bg-white rounded-3xl p-4 items-center gap-2" style={CARD_SHADOW}>
        <View className="flex-row items-center gap-2 self-start">
          <Ionicons name="image-outline" size={18} color="#2563eb" />
          <Text className="text-base font-semibold text-gray-700">Copy this drawing</Text>
        </View>
        <ReferenceFigure referenceAsset={question.referenceAsset} />
      </View>

      {/* Drawing canvas */}
      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Ionicons name="brush-outline" size={18} color="#2563eb" />
            <Text className="text-base font-semibold text-gray-700">Draw it here</Text>
          </View>
          <TouchableOpacity
            onPress={handleClear}
            disabled={!hasDrawn}
            accessibilityRole="button"
            accessibilityLabel="Clear drawing"
            className={`flex-row items-center gap-1 rounded-full px-3 py-1.5 ${
              hasDrawn ? 'bg-gray-100' : 'opacity-40'
            }`}
          >
            <Ionicons name="trash-outline" size={16} color="#4b5563" />
            <Text className="text-sm font-medium text-gray-600">Clear</Text>
          </TouchableOpacity>
        </View>
        <View
          className="border-2 border-dashed border-blue-200 rounded-3xl overflow-hidden bg-white"
          style={{ height: 280 }}
        >
          <GestureDetector gesture={pan}>
            <Canvas style={StyleSheet.absoluteFill}>

              {/* Render all completed strokes */}
              {paths.map((p, i) => (
                <Path
                  key={i}
                  path={p.path}
                  color={p.color}
                  style="stroke"
                  strokeWidth={p.strokeWidth}
                  strokeJoin="round"
                  strokeCap="round"
                />
              ))}

              {/* Render the stroke currently being drawn */}
              {currentPath && (
                <Path
                  path={currentPath}
                  color="#1e293b"
                  style="stroke"
                  strokeWidth={2.5}
                  strokeJoin="round"
                  strokeCap="round"
                />
              )}

            </Canvas>
          </GestureDetector>

          {/* Empty state hint */}
          {!hasDrawn && (
            <View className="absolute inset-0 items-center justify-center gap-2 pointer-events-none">
              <Ionicons name="hand-left-outline" size={32} color="#cbd5e1" />
              <Text className="text-gray-400 text-base">Use your finger to draw</Text>
            </View>
          )}
        </View>
      </View>

      {/*
        Caregiver scoring section.

        MMSE scoring for this question requires human judgement.
        The Caregiver looks at what the patient drew and decides:

        The figure rotates per session (pentagons, cube, overlapping
        squares, diamond in square); each comes with its own checklist in
        `question.criteria` (pentagons when absent, for older sessions).

        PASS (1 point)  - the drawing meets every item on the checklist
        FAIL (0 points) - any item is not met, or the patient refused /
                          was unable to draw
      */}
      {hasDrawn && (
        <View className="gap-4">
          {/* Scoring criteria checklist - for Caregiver reference */}
          <InfoCard icon="list-outline" tone="caregiver" title="Check the drawing">
            <View className="gap-1.5 mt-1">
              {(question.criteria?.length ? question.criteria : PENTAGON_CRITERIA).map((c) => (
                <View key={c} className="flex-row items-center gap-2">
                  <Ionicons name="ellipse" size={6} color="#b45309" />
                  <Text className="text-base text-amber-800">{c}</Text>
                </View>
              ))}
            </View>
          </InfoCard>

          <VerdictButtons
            question="Does the drawing meet all the criteria?"
            value={CaregiverMarked === null ? null : CaregiverMarked ? 'correct' : 'incorrect'}
            onSelect={(v) => handleMark(v === 'correct')}
            correctLabel="Correct · 1 pt"
            incorrectLabel="Incorrect · 0 pts"
          />
        </View>
      )}

    </View>
  );
}
