import { Question } from '@/src/types/assessment.types';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { CARD_SHADOW, InfoCard, VerdictButtons } from '../assessmentUi';

interface Props {
  question: Question;
  onAnswer: (answer: string) => void;
}

export function InstructionActionRenderer({ question, onAnswer }: Props) {
  const [userResponse, setUserResponse] = useState<'correct' | 'incorrect' | null>(null);

  useEffect(() => {
    setUserResponse(null);
  }, [question.id]);

  const handleSelect = (value: 'correct' | 'incorrect') => {
    setUserResponse(value);
    onAnswer(value);
  };

  const steps = question.instructionSteps ?? [];

  return (
    <View className="px-6 gap-5 pb-4">
      {/* Big instruction (e.g. "CLOSE YOUR EYES") */}
      {question.subPrompt && (
        <View
          className="bg-white rounded-3xl px-6 py-8 border-2 border-blue-200"
          style={CARD_SHADOW}
        >
          <Text className="text-center text-3xl font-extrabold text-blue-700 tracking-wide leading-tight">
            {question.subPrompt}
          </Text>
        </View>
      )}

      {/* Step-by-step instructions */}
      {steps.length > 0 && (
        <View className="bg-white rounded-3xl p-4 gap-1" style={CARD_SHADOW}>
          {steps.map((step, index) => (
            <View key={index} className="flex-row items-center gap-4 py-2">
              <View className="w-10 h-10 rounded-full bg-blue-500 items-center justify-center">
                <Text className="text-white font-bold text-base">{index + 1}</Text>
              </View>
              <Text className="flex-1 text-gray-800 text-lg font-medium">{step}</Text>
            </View>
          ))}
        </View>
      )}

      <InfoCard icon="eye-outline" tone="caregiver">
        Watch the patient and check that each instruction is followed.
      </InfoCard>

      <VerdictButtons
        question="Did the patient follow the instruction correctly?"
        value={userResponse}
        onSelect={handleSelect}
        locked
        correctLabel="Yes, correct"
        incorrectLabel="No, incorrect"
      />
    </View>
  );
}
