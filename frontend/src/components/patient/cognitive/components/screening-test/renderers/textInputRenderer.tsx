import { Question } from '@/src/types/assessment.types';
import React, { useEffect, useState } from 'react';
import { Keyboard, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { InfoCard } from '../assessmentUi';

interface Props {
  question: Question;
  onAnswer: (answer: string) => void;
}

export function TextInputRenderer({ question, onAnswer }: Props) {
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);

  // Reset when navigating between questions.
  useEffect(() => {
    setText('');
    setSaved(false);
  }, [question.id]);

  const save = () => {
    if (!text.trim()) return;
    onAnswer(text.trim());
    setSaved(true);
    Keyboard.dismiss();
  };

  return (
    <View className="px-6 gap-4">
      <InfoCard icon="create-outline">
        {question.subPrompt || 'Write a complete sentence below'}
      </InfoCard>

      <TextInput
        value={text}
        onChangeText={(t) => {
          setText(t);
          if (saved) setSaved(false);
        }}
        placeholder="Type your sentence here…"
        placeholderTextColor="#9ca3af"
        accessibilityLabel="Your sentence"
        multiline
        textAlignVertical="top"
        className="border-2 border-blue-300 rounded-3xl px-5 py-4 text-xl bg-white text-gray-900"
        style={{ minHeight: 120 }}
        maxLength={200}
        autoFocus
        autoCapitalize="sentences"
        // A sentence needs no line breaks: the return key saves instead.
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
        onSubmitEditing={save}
        onEndEditing={save}
      />

      <TouchableOpacity
        onPress={save}
        disabled={!text.trim()}
        accessibilityRole="button"
        accessibilityState={{ disabled: !text.trim() }}
        className={`py-4 rounded-2xl items-center ${
          text.trim() ? 'bg-blue-500' : 'bg-gray-300'
        }`}
        activeOpacity={0.7}
      >
        <Text className="text-white font-semibold text-lg">
          {saved ? 'Saved ✓' : 'Save sentence'}
        </Text>
      </TouchableOpacity>

      {saved && (
        <InfoCard icon="checkmark-circle" tone="success" title="Sentence recorded">
          Tap “Next” to continue.
        </InfoCard>
      )}
    </View>
  );
}
