import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import { Question } from '@/src/types/assessment.types';
import { InfoCard, tapFeedback, VerdictButtons } from '../assessmentUi';

interface Props {
  question: Question;
  onAnswer: (answer: string) => void;
}

export function PhraseRepeatRenderer({ question, onAnswer }: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasListened, setHasListened] = useState(false);
  const [userResponse, setUserResponse] = useState<'correct' | 'incorrect' | null>(null);

  // expo-audio player (loads the file and frees it automatically on unmount)
  const player = useAudioPlayer(require('@/assets/audio/patient-assessment.mp3'));
  const status = useAudioPlayerStatus(player);

  // Rotated phrases have no recorded clip: read them aloud on the device.
  // Sessions without a `phrase` (older ones) always use the recorded clip.
  const useSpeech = !!question.phrase && !question.audioAsset;

  // Same as the old setOnPlaybackStatusUpdate "didJustFinish" check
  useEffect(() => {
    if (status.didJustFinish) {
      setIsPlaying(false);
      setHasListened(true);
    }
  }, [status.didJustFinish]);

  // Stop any speech when leaving the question.
  useEffect(() => () => {
    Speech.stop();
  }, []);

  const finishPlayback = () => {
    setIsPlaying(false);
    setHasListened(true);
  };

  const playAudio = async () => {
    try {
      tapFeedback();
      setIsPlaying(true);

      if (useSpeech) {
        Speech.stop();
        Speech.speak(question.phrase!, {
          rate: 0.85,
          onDone: finishPlayback,
          onStopped: () => setIsPlaying(false),
          onError: () => {
            setIsPlaying(false);
            Alert.alert('Error', 'Failed to read the phrase aloud');
          },
        });
        return;
      }

      // Rewind to the start and play
      await player.seekTo(0);
      player.play();
    } catch (error) {
      console.error('Error playing audio:', error);
      Alert.alert('Error', 'Failed to play audio');
      setIsPlaying(false);
    }
  };

  const handleSelect = (value: 'correct' | 'incorrect') => {
    setUserResponse(value);
    onAnswer(value);
  };

  return (
    <View className="px-6 gap-6 pb-4">
      {question.subPrompt && (
        <InfoCard icon="ear-outline">{question.subPrompt}</InfoCard>
      )}

      {/* Play Audio Button */}
      <View className="items-center gap-3 py-2">
        <TouchableOpacity
          onPress={playAudio}
          disabled={isPlaying}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Playing phrase' : hasListened ? 'Play the phrase again' : 'Play the phrase'}
          className={`w-36 h-36 rounded-full items-center justify-center border-8 ${
            isPlaying ? 'bg-blue-300 border-blue-100' : 'bg-blue-500 border-blue-100'
          }`}
        >
          <Ionicons
            name={isPlaying ? 'volume-high' : hasListened ? 'refresh' : 'play'}
            size={56}
            color="white"
          />
        </TouchableOpacity>
        <Text className="text-lg font-semibold text-gray-700">
          {isPlaying ? 'Listen carefully…' : hasListened ? 'Play again' : 'Tap to listen'}
        </Text>
      </View>

      {/* Patient repeats verbally here - clinician listens */}
      {hasListened && (
        <>
          <InfoCard icon="mic-outline" tone="success" title="Now repeat the phrase aloud">
            The caregiver will check if it was said correctly.
          </InfoCard>

          <VerdictButtons
            question="Did the patient repeat it correctly?"
            value={userResponse}
            onSelect={handleSelect}
            locked
            correctLabel="Yes, correct"
            incorrectLabel="No, incorrect"
          />
        </>
      )}
    </View>
  );
}
