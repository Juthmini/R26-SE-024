import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Question } from "@/src/types/assessment.types";
import { ChoiceCard } from "../assessmentUi";

interface Props {
  question: Question;
  onAnswer: (answer: string) => void;
}

export function MCQRenderer({ question, onAnswer }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  // Prevent stale selected state when moving between questions.
  useEffect(() => {
    setSelected(null);
  }, [question.id]);

  const handleSelect = (optionLabel: string) => {
    setSelected(optionLabel);
    onAnswer(optionLabel);
  };

  return (
    <View className="px-6 gap-3" accessibilityRole="radiogroup">
      {question.options?.map((opt, i) => (
        <ChoiceCard
          key={opt.id}
          index={i}
          label={opt.label}
          selected={selected === opt.label}
          onPress={() => handleSelect(opt.label)}
        />
      ))}
    </View>
  );
}
