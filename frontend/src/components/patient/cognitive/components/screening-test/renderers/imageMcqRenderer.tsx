import React, { useState } from 'react';
import { View, Text, Image } from 'react-native';
import { Question } from '@/src/types/assessment.types';
import { CARD_SHADOW, ChoiceCard } from '../assessmentUi';

interface Props {
  question: Question;
  onAnswer: (answer: string) => void;
}

export function ImageMcqRenderer({ question, onAnswer }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleSelect = (optionLabel: string) => {
    setSelected(optionLabel);
    onAnswer(optionLabel);
  };

  return (
    <View className="px-6 gap-6 pb-4">
      {/* Display Image */}
      {question.image && (
        <View className="bg-white rounded-3xl p-4" style={CARD_SHADOW}>
          <Image
            source={{ uri: question.image }}
            style={{ width: '100%', height: 240, borderRadius: 16 }}
            resizeMode="contain"
            accessibilityLabel={question.imageDescription || 'Question image'}
          />
          {question.imageDescription && (
            <Text className="text-base text-gray-500 mt-3 text-center">
              {question.imageDescription}
            </Text>
          )}
        </View>
      )}

      {/* On-device picture for rotated naming items without a photo */}
      {!question.image && !!question.emoji && (
        <View
          className="bg-white rounded-3xl p-6 items-center justify-center"
          style={[CARD_SHADOW, { height: 240 }]}
          accessible
          accessibilityRole="image"
          accessibilityLabel="Picture of an everyday object"
        >
          <Text style={{ fontSize: 150, lineHeight: 180 }}>{question.emoji}</Text>
        </View>
      )}

      {/* MCQ Options */}
      <View className="gap-3" accessibilityRole="radiogroup">
        {question.options?.map((option, idx) => (
          <ChoiceCard
            key={option.id ?? idx}
            index={idx}
            label={option.label}
            selected={selected === option.label}
            onPress={() => handleSelect(option.label)}
          />
        ))}
      </View>
    </View>
  );
}
