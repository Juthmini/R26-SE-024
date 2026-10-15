import {
  FAQ_CHOICES,
  FAQ_QUESTIONS,
  FaqAnswers,
} from "@/src/types/dementia.types";
import * as Speech from "expo-speech";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInRight } from "react-native-reanimated";

// Step-by-step Daily-Living Questionnaire (FAQ), shared by the patient
// assessment screen and the profile "Retake questionnaire" modal.
//
// One question per screen, big picture + plain wording, four large answer
// buttons. Tapping an answer moves on by itself; Back/Next are always there,
// and a final review screen lets the carer check or change any answer before
// submitting. The answers handed to onSubmit are exactly the 10 FAQ keys the
// triage model expects (0-3 each).
const TOTAL = FAQ_QUESTIONS.length;
const REVIEW = TOTAL + 1; // step 0 = intro, 1..TOTAL = questions, TOTAL+1 = review
const ADVANCE_DELAY_MS = 350;
const PRIMARY = "#3B82F6";

interface Props {
  submitLabel: string;
  submitting: boolean;
  error: string | null;
  onSubmit: (answers: FaqAnswers) => void;
  /** When given, a "Close" button is shown in the header (modal use). */
  onClose?: () => void;
}

export function FaqQuestionnaire({ submitLabel, submitting, error, onSubmit, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<FaqAnswers>>({});
  const [speaking, setSpeaking] = useState(false);
  const backToReview = useRef(false); // true while editing one answer from the review screen
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === TOTAL;
  const question = step >= 1 && step <= TOTAL ? FAQ_QUESTIONS[step - 1] : null;

  const stopSpeech = useCallback(() => {
    Speech.stop();
    setSpeaking(false);
  }, []);

  const clearTimer = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = null;
  };

  useEffect(
    () => () => {
      clearTimer();
      Speech.stop();
    },
    [],
  );

  const goTo = (next: number) => {
    clearTimer();
    stopSpeech();
    setStep(next);
  };

  const choose = (value: number) => {
    if (!question) return;
    setAnswers((prev) => ({ ...prev, [question.key]: value }));
    clearTimer();
    stopSpeech();
    const from = step;
    advanceTimer.current = setTimeout(() => {
      if (backToReview.current) {
        backToReview.current = false;
        setStep(REVIEW);
      } else {
        setStep((current) => (current === from ? from + 1 : current));
      }
    }, ADVANCE_DELAY_MS);
  };

  const editFromReview = (index: number) => {
    backToReview.current = true;
    goTo(index + 1);
  };

  const onNext = () => {
    if (backToReview.current && question && answers[question.key] !== undefined) {
      backToReview.current = false;
      goTo(REVIEW);
      return;
    }
    goTo(step + 1);
  };

  const onBack = () => {
    if (backToReview.current) {
      backToReview.current = false;
      goTo(REVIEW);
      return;
    }
    goTo(Math.max(0, step - 1));
  };

  const toggleListen = () => {
    if (!question) return;
    if (speaking) {
      stopSpeech();
      return;
    }
    setSpeaking(true);
    const options = FAQ_CHOICES.map((c) => `${c.title}. ${c.detail}`).join(" ");
    Speech.speak(`${question.question} ${question.examples} The choices are. ${options}`, {
      rate: 0.9,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  // Cap content to a readable column and centre it on wide (web) viewports.
  const column = "w-full max-w-[640px] self-center";
  const progressPct = step === 0 ? 0 : Math.min(100, Math.round(((step - 1 + (step > TOTAL ? 1 : 0)) / TOTAL) * 100));

  // ── Header: title, progress ───────────────────────────────────────────────
  const header = (
    <View className="bg-white border-b border-gray-100">
      <View className={`${column} px-5 pt-4 pb-3`}>
        <View className="flex-row items-center justify-between">
          <Text className="text-lg font-extrabold text-gray-900">Daily-Living Questions</Text>
          {onClose ? (
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close questionnaire"
              className="px-4 py-2 rounded-xl bg-gray-100"
            >
              <Text className="text-sm font-semibold text-gray-600">Close</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {step > 0 ? (
          <>
            <View className="h-2.5 bg-gray-100 rounded-full overflow-hidden mt-3">
              <View
                className="h-full rounded-full"
                style={{ width: `${progressPct}%`, backgroundColor: PRIMARY }}
              />
            </View>
            <Text className="text-sm font-semibold text-gray-500 mt-2">
              {question ? `Question ${step} of ${TOTAL}` : "Almost done - check your answers"}
            </Text>
          </>
        ) : null}
      </View>
    </View>
  );

  // ── Step 0: friendly introduction ────────────────────────────────────────
  if (step === 0) {
    return (
      <View style={{ flex: 1 }} className="bg-gray-50">
        {header}
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
          <Animated.View entering={FadeIn.duration(300)} className={column}>
            <View className="bg-white rounded-3xl border border-gray-100 p-6 items-center">
              <View className="w-24 h-24 rounded-full bg-blue-50 items-center justify-center mb-4">
                <Text style={{ fontSize: 48 }}>🏡</Text>
              </View>
              <Text className="text-2xl font-extrabold text-gray-900 text-center mb-2">
                A few simple questions
              </Text>
              <Text className="text-base text-gray-600 text-center leading-6">
                These questions are about everyday life at home. They help us understand
                how things are going.
              </Text>
            </View>

            <View className="bg-white rounded-3xl border border-gray-100 p-5 mt-4 gap-4">
              {[
                { emoji: "⏱️", text: `${TOTAL} questions - about 3 minutes` },
                { emoji: "👥", text: "Best answered by the patient together with a family member or carer" },
                { emoji: "✅", text: "There are no right or wrong answers - just pick what fits best" },
              ].map((row) => (
                <View key={row.emoji} className="flex-row items-center gap-4">
                  <View className="w-12 h-12 rounded-2xl bg-gray-50 items-center justify-center">
                    <Text style={{ fontSize: 24 }}>{row.emoji}</Text>
                  </View>
                  <Text className="flex-1 text-base text-gray-800 leading-6">{row.text}</Text>
                </View>
              ))}
            </View>

            <View className="rounded-2xl p-4 mt-4" style={{ backgroundColor: "#EFF6FF" }}>
              <Text className="text-sm text-blue-900 leading-5 text-center">
                Think about how things are now, compared with a few years ago.
              </Text>
            </View>
          </Animated.View>
        </ScrollView>
        <View className="bg-white border-t border-gray-100">
          <View className={`${column} px-5 py-4`}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => goTo(1)}
              accessibilityRole="button"
              className="py-5 rounded-2xl items-center"
              style={{ backgroundColor: PRIMARY }}
            >
              <Text className="text-white text-xl font-bold">Start</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ── Final step: review & submit ─────────────────────────────────────────
  if (step === REVIEW) {
    return (
      <View style={{ flex: 1 }} className="bg-gray-50">
        {header}
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          <Animated.View entering={FadeIn.duration(300)} className={column}>
            <Text className="text-2xl font-extrabold text-gray-900 mb-1">Your answers</Text>
            <Text className="text-base text-gray-500 mb-4">
              Tap any answer to change it. When you are happy, press the button below.
            </Text>
            {FAQ_QUESTIONS.map((q, index) => {
              const choice = FAQ_CHOICES.find((c) => c.value === answers[q.key]);
              return (
                <TouchableOpacity
                  key={q.key}
                  activeOpacity={0.7}
                  onPress={() => editFromReview(index)}
                  accessibilityRole="button"
                  accessibilityLabel={`${q.title}: ${choice ? choice.title : "not answered"}. Tap to change.`}
                  className="bg-white rounded-2xl border border-gray-100 p-4 mb-2.5 flex-row items-center gap-3"
                >
                  <Text style={{ fontSize: 28 }}>{q.emoji}</Text>
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-gray-900">{q.title}</Text>
                    <Text
                      className="text-sm font-semibold mt-0.5"
                      style={{ color: choice ? choice.accent : "#9CA3AF" }}
                    >
                      {choice ? `${choice.emoji}  ${choice.title}` : "Not answered yet"}
                    </Text>
                  </View>
                  <Text className="text-sm font-semibold" style={{ color: PRIMARY }}>
                    Change
                  </Text>
                </TouchableOpacity>
              );
            })}
            {error ? (
              <Text className="text-base text-red-600 text-center mt-2">{error}</Text>
            ) : null}
          </Animated.View>
        </ScrollView>
        <View className="bg-white border-t border-gray-100">
          <View className={`${column} px-5 py-4`}>
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={!allAnswered || submitting}
              onPress={() => onSubmit(answers as FaqAnswers)}
              accessibilityRole="button"
              className="py-5 rounded-2xl items-center"
              style={{ backgroundColor: allAnswered && !submitting ? PRIMARY : "#E5E7EB" }}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text
                  className="text-xl font-bold"
                  style={{ color: allAnswered ? "#FFFFFF" : "#9CA3AF" }}
                >
                  {allAnswered ? submitLabel : `Answer all ${TOTAL} questions`}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => goTo(TOTAL)} className="py-3 items-center" disabled={submitting}>
              <Text className="text-base font-semibold text-gray-500">← Back to the last question</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ── Question steps ──────────────────────────────────────────────────────
  const q = question!;
  const selected = answers[q.key];

  return (
    <View style={{ flex: 1 }} className="bg-gray-50">
      {header}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View key={q.key} entering={FadeInRight.duration(260)} className={column}>
          {/* The question */}
          <View className="bg-white rounded-3xl border border-gray-100 p-5 items-center">
            <View className="w-20 h-20 rounded-full bg-blue-50 items-center justify-center mb-3">
              <Text style={{ fontSize: 40 }}>{q.emoji}</Text>
            </View>
            <Text className="text-sm font-bold uppercase tracking-widest text-blue-500 mb-1">
              {q.title}
            </Text>
            <Text className="text-2xl font-extrabold text-gray-900 text-center leading-8">
              {q.question}
            </Text>
            <Text className="text-base text-gray-500 text-center leading-6 mt-2">{q.examples}</Text>
            <TouchableOpacity
              onPress={toggleListen}
              accessibilityRole="button"
              accessibilityLabel={speaking ? "Stop reading the question" : "Read the question aloud"}
              className="mt-4 px-5 py-3 rounded-full flex-row items-center gap-2"
              style={{ backgroundColor: speaking ? "#111827" : "#EFF6FF" }}
            >
              <Text style={{ fontSize: 18 }}>{speaking ? "⏹️" : "🔊"}</Text>
              <Text
                className="text-base font-semibold"
                style={{ color: speaking ? "#FFFFFF" : "#1D4ED8" }}
              >
                {speaking ? "Stop" : "Read it to me"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* The answers */}
          <Text className="text-base font-bold text-gray-700 mt-5 mb-2 px-1">
            Which fits best?
          </Text>
          <View className="gap-3">
            {FAQ_CHOICES.map((choice) => {
              const isSelected = selected === choice.value;
              return (
                <TouchableOpacity
                  key={choice.value}
                  activeOpacity={0.8}
                  onPress={() => choose(choice.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${choice.title}. ${choice.detail}`}
                  className="rounded-2xl flex-row items-center px-4 py-4 gap-4"
                  style={{
                    minHeight: 76,
                    backgroundColor: isSelected ? choice.tint : "#FFFFFF",
                    borderWidth: 2.5,
                    borderColor: isSelected ? choice.accent : "#E5E7EB",
                  }}
                >
                  <View
                    className="w-14 h-14 rounded-full items-center justify-center"
                    style={{ backgroundColor: isSelected ? "#FFFFFF" : choice.tint }}
                  >
                    <Text style={{ fontSize: 28 }}>{choice.emoji}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-lg font-bold text-gray-900">{choice.title}</Text>
                    <Text className="text-sm text-gray-600 leading-5 mt-0.5">{choice.detail}</Text>
                  </View>
                  {isSelected ? (
                    <View
                      className="w-8 h-8 rounded-full items-center justify-center"
                      style={{ backgroundColor: choice.accent }}
                    >
                      <Text className="text-white text-base font-extrabold">✓</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </ScrollView>

      {/* Back / Next */}
      <View className="bg-white border-t border-gray-100">
        <View className={`${column} px-5 py-4 flex-row gap-3`}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onBack}
            accessibilityRole="button"
            className="py-4 px-6 rounded-2xl items-center border-2 border-gray-200 bg-white"
          >
            <Text className="text-lg font-semibold text-gray-700">← Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={selected === undefined}
            onPress={onNext}
            accessibilityRole="button"
            className="flex-1 py-4 rounded-2xl items-center"
            style={{ backgroundColor: selected === undefined ? "#E5E7EB" : PRIMARY }}
          >
            <Text
              className="text-lg font-bold"
              style={{ color: selected === undefined ? "#9CA3AF" : "#FFFFFF" }}
            >
              {step === TOTAL ? "Review answers →" : "Next →"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
