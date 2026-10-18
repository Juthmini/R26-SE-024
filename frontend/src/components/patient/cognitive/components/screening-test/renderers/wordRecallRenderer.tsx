import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Question } from "@/src/types/assessment.types";
import { CARD_SHADOW, InfoCard, tapFeedback } from "../assessmentUi";

interface Props {
  question: Question;
  onAnswer: (recalled: string[]) => void;
  secondsLeft: number;
  timeLimit: number | null;
}

export function WordRecallRenderer({
  question,
  onAnswer,
  secondsLeft,
  timeLimit,
}: Props) {
  const [recalled, setRecalled] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setRecalled({});
  }, [question.id]);

  const isRegistration = question.type === "word_recall_display";
  const isRecall = question.type === "word_recall_input";

  // Registration: show words during timer, then mark.
  // Recall: never show words first; directly mark recalled words.
  const phase = useMemo<"showing" | "marking">(() => {
    if (isRecall) return "marking";
    return secondsLeft > 0 ? "showing" : "marking";
  }, [isRecall, secondsLeft]);

  const words = question.words ?? [];
  const markedCount = words.filter((w) => recalled[w]).length;

  const toggle = (word: string) => {
    if (phase !== "marking") return;
    tapFeedback();

    const updated = { ...recalled, [word]: !recalled[word] };
    setRecalled(updated);

    const recalledWords = Object.entries(updated)
      .filter(([, checked]) => checked)
      .map(([w]) => w);

    onAnswer(recalledWords);
  };

  return (
    <View className="px-6 gap-4">
      {phase === "showing" ? (
        <View className="gap-4">
          <InfoCard icon="eye-outline" title="Memorise these words">
            Read them aloud and try to remember them.
          </InfoCard>

          {words.map((word, i) => (
            <View
              key={word}
              className="flex-row items-center gap-4 bg-white rounded-3xl px-5 py-5 border border-violet-100"
              style={CARD_SHADOW}
            >
              <View className="w-10 h-10 rounded-full bg-violet-100 items-center justify-center">
                <Text className="text-violet-700 font-bold text-base">
                  {i + 1}
                </Text>
              </View>
              <Text className="flex-1 text-3xl font-bold text-gray-900 tracking-wide">
                {word}
              </Text>
            </View>
          ))}

          {!!timeLimit && (
            <Text className="text-sm text-gray-500 text-center">
              The words will hide in {secondsLeft}s, then the caregiver marks
              the answers.
            </Text>
          )}
        </View>
      ) : (
        <View className="gap-3">
          <InfoCard
            icon="person-circle-outline"
            tone="caregiver"
            title="For the caregiver"
          >
            {isRegistration
              ? "Tap each word the patient repeated correctly."
              : "Tap each word the patient recalled correctly."}
          </InfoCard>

          {words.map((word) => {
            const isRecalled = recalled[word] ?? false;
            return (
              <TouchableOpacity
                key={word}
                onPress={() => toggle(word)}
                activeOpacity={0.8}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isRecalled }}
                accessibilityLabel={word}
                className={`flex-row items-center gap-4 rounded-2xl border-2 px-4 py-4 ${
                  isRecalled
                    ? "bg-emerald-50 border-emerald-500"
                    : "bg-white border-gray-200"
                }`}
              >
                <View
                  className={`w-8 h-8 rounded-lg border-2 items-center justify-center ${
                    isRecalled
                      ? "bg-emerald-500 border-emerald-500"
                      : "border-gray-300 bg-white"
                  }`}
                >
                  {isRecalled && (
                    <Ionicons name="checkmark" size={20} color="white" />
                  )}
                </View>
                <Text
                  className={`flex-1 text-xl font-semibold ${
                    isRecalled ? "text-emerald-800" : "text-gray-800"
                  }`}
                >
                  {word}
                </Text>
              </TouchableOpacity>
            );
          })}

          <Text className="text-center text-base text-gray-500 mt-1">
            {markedCount} of {words.length} marked correct
          </Text>
        </View>
      )}
    </View>
  );
}
