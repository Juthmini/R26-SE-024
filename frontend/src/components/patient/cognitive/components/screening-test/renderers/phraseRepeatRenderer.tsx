import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { Question } from '@/src/types/assessment.types';

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

  // Same as the old setOnPlaybackStatusUpdate "didJustFinish" check
  useEffect(() => {
    if (status.didJustFinish) {
      setIsPlaying(false);
      setHasListened(true);
    }
  }, [status.didJustFinish]);

  const playAudio = async () => {
    try {
      setIsPlaying(true);

      // Rewind to the start and play
      await player.seekTo(0);
      player.play();
    } catch (error) {
      console.error('Error playing audio:', error);
      Alert.alert('Error', 'Failed to play audio');
      setIsPlaying(false);
    }
  };

  const handleCorrect = () => {
    setUserResponse('correct');
    onAnswer('correct');
  };

  const handleIncorrect = () => {
    setUserResponse('incorrect');
    onAnswer('incorrect');
  };

  const handlePlayAgain = async () => {
    await playAudio();
  };

  return (
    <View className="px-6 gap-6 pb-8">
      {/* Instruction */}
      <View className="bg-blue-50 rounded-2xl p-4">
        <Text className="text-center text-blue-700 font-semibold text-lg">
          {question.prompt}
        </Text>
        {question.subPrompt && (
          <Text className="text-center text-blue-600 text-base mt-2 font-medium">
            {question.subPrompt}
          </Text>
        )}
      </View>

      {/* Play Audio Button */}
      <TouchableOpacity
        onPress={playAudio}
        disabled={isPlaying}
        className={`rounded-2xl py-6 items-center justify-center gap-2 ${
          isPlaying ? 'bg-gray-300' : 'bg-blue-500'
        }`}
      >
        <Ionicons name={isPlaying ? 'volume-mute' : 'volume-high'} size={32} color="white" />
        <Text className="text-white font-semibold text-base">
          {isPlaying ? 'Playing...' : 'Play Audio'}
        </Text>
      </TouchableOpacity>

      {/* Patient repeats verbally here - clinician listens */}
      {hasListened && (
        <>
          <View className="bg-green-50 rounded-2xl p-4 border border-green-200">
            <Text className="text-center text-green-700 font-semibold">
              ✓ Please repeat the phrase aloud
            </Text>
            <Text className="text-center text-gray-600 text-sm mt-2">
              The caregiver will verify if you said it correctly
            </Text>
          </View>

          {/* Verification Buttons for Caregiver */}
          <View className="gap-3 mt-4">
            <Text className="text-gray-700 font-semibold text-center">
              Did the patient repeat correctly?
            </Text>

            <TouchableOpacity
              onPress={handleCorrect}
              disabled={userResponse !== null}
              className={`rounded-2xl py-4 items-center ${
                userResponse === 'correct'
                  ? 'bg-green-500'
                  : userResponse === 'incorrect'
                  ? 'bg-gray-300'
                  : 'bg-green-500'
              }`}
            >
              <Text className="text-white font-semibold text-base">
                ✓ Yes, Correct
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleIncorrect}
              disabled={userResponse !== null}
              className={`rounded-2xl py-4 items-center ${
                userResponse === 'incorrect'
                  ? 'bg-red-500'
                  : userResponse === 'correct'
                  ? 'bg-gray-300'
                  : 'bg-red-500'
              }`}
            >
              <Text className="text-white font-semibold text-base">
                ✗ No, Incorrect
              </Text>
            </TouchableOpacity>

            {userResponse && (
              <TouchableOpacity
                onPress={handlePlayAgain}
                className="rounded-2xl py-3 border border-blue-500 items-center mt-2"
              >
                <Text className="text-blue-600 font-semibold">Play Again</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}
    </View>
  );
}