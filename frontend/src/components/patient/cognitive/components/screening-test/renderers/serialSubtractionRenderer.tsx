import { Question } from '@/src/types/assessment.types';
import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { Keyboard, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { InfoCard, tapFeedback } from '../assessmentUi';

interface Props {
  question: Question;
  onAnswer: (answers: string[]) => void;
}

const TOTAL_STEPS = 5;

export function SerialSubtractionRenderer({ question, onAnswer }: Props) {
  const [entries, setEntries] = useState<string[]>(Array(TOTAL_STEPS).fill(''));
  const [currentStep, setCurrentStep] = useState(0);
  const [inputVal, setInputVal] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const canSubmit = inputVal.length > 0;

  // Only allow digits so the number pad / hardware keyboard can't add stray characters.
  const handleChange = (text: string) => setInputVal(text.replace(/[^0-9]/g, ''));

  const submitStep = () => {
    if (!canSubmit) return;
    tapFeedback();
    const updated = [...entries];
    updated[currentStep] = inputVal;
    setEntries(updated);
    setInputVal('');

    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep(prev => prev + 1);
      // Keep the keyboard open for the next subtraction.
      inputRef.current?.focus();
    } else {
      setIsComplete(true);
      Keyboard.dismiss();
      onAnswer(updated);
    }
  };

  // Let the patient correct the previous entry before finishing.
  const undoLast = () => {
    if (currentStep === 0 || isComplete) return;
    const prevStep = currentStep - 1;
    const updated = [...entries];
    setInputVal(updated[prevStep]);
    updated[prevStep] = '';
    setEntries(updated);
    setCurrentStep(prevStep);
    inputRef.current?.focus();
  };

  return (
    <View className="px-6 gap-5">
      <InfoCard icon="calculator-outline" title="Start from 100">
        {question.subPrompt || 'Subtract 7 each time'}
      </InfoCard>

      {/* Answer slots — current step highlighted */}
      <View className="flex-row justify-between gap-2">
        {entries.map((e, i) => {
          const isCurrent = !isComplete && i === currentStep;
          return (
            <View
              key={i}
              accessible
              accessibilityLabel={`Answer ${i + 1}: ${e || (isCurrent ? 'now entering' : 'empty')}`}
              className={`flex-1 items-center rounded-xl py-3 border-2 ${
                isCurrent
                  ? 'border-blue-500 bg-white'
                  : e
                    ? 'border-gray-200 bg-gray-50'
                    : 'border-dashed border-gray-300 bg-white'
              }`}
            >
              <Text className="text-xs text-gray-500">{i + 1}</Text>
              <Text className="text-xl font-semibold text-gray-800 mt-1">
                {e || (isCurrent ? '?' : '–')}
              </Text>
            </View>
          );
        })}
      </View>

      {!isComplete && (
        <View className="gap-3">
          <Text className="text-base text-gray-600 text-center">
            Answer {currentStep + 1} of {TOTAL_STEPS}
          </Text>

          <TextInput
            ref={inputRef}
            value={inputVal}
            onChangeText={handleChange}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={3}
            placeholder="Type number"
            placeholderTextColor="#9ca3af"
            accessibilityLabel={`Answer ${currentStep + 1} of ${TOTAL_STEPS}`}
            className="border-2 border-blue-400 rounded-3xl py-5 text-4xl font-bold text-center bg-white text-gray-900"
            autoFocus
            submitBehavior="submit"
            returnKeyType="done"
            onSubmitEditing={submitStep}
          />

          {/* The iOS number pad has no return key, so this button is the main way to submit. */}
          <TouchableOpacity
            onPress={submitStep}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit }}
            className={`rounded-2xl py-4 flex-row items-center justify-center gap-2 ${
              canSubmit ? 'bg-blue-500' : 'bg-gray-300'
            }`}
            activeOpacity={0.7}
          >
            <Text className="text-white font-semibold text-lg">
              {currentStep < TOTAL_STEPS - 1 ? 'Enter' : 'Finish'}
            </Text>
            <Ionicons
              name={currentStep < TOTAL_STEPS - 1 ? 'arrow-forward' : 'checkmark'}
              size={22}
              color="white"
            />
          </TouchableOpacity>

          {currentStep > 0 && (
            <TouchableOpacity
              onPress={undoLast}
              accessibilityRole="button"
              className="flex-row items-center justify-center gap-1 py-2"
            >
              <Ionicons name="arrow-undo" size={18} color="#2563eb" />
              <Text className="text-blue-600 font-medium text-base">
                Change answer {currentStep}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {isComplete && (
        <InfoCard icon="checkmark-circle" tone="success" title="All answers recorded">
          Tap “Next” to continue.
        </InfoCard>
      )}
    </View>
  );
}
