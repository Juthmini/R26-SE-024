import { ProgressBar } from "@/src/components/patient/cognitive/components/screening-test/progressBar";
import { DrawingRenderer } from "@/src/components/patient/cognitive/components/screening-test/renderers/drawingRenderer";
import { ImageMcqRenderer } from "@/src/components/patient/cognitive/components/screening-test/renderers/imageMcqRenderer";
import { InstructionActionRenderer } from "@/src/components/patient/cognitive/components/screening-test/renderers/instructionActionRenderer";
import { MCQRenderer } from "@/src/components/patient/cognitive/components/screening-test/renderers/mcqRenderer";
import { PhraseRepeatRenderer } from "@/src/components/patient/cognitive/components/screening-test/renderers/phraseRepeatRenderer";
import { SerialSubtractionRenderer } from "@/src/components/patient/cognitive/components/screening-test/renderers/serialSubtractionRenderer";
import { TextInputRenderer } from "@/src/components/patient/cognitive/components/screening-test/renderers/textInputRenderer";
import { TimerBar } from "@/src/components/patient/cognitive/components/screening-test/renderers/timeBar";
import { WordRecallRenderer } from "@/src/components/patient/cognitive/components/screening-test/renderers/wordRecallRenderer";
import { useAssessmentSession } from "@/src/hooks/useAssessmentSession";
import { useQuestionTimer } from "@/src/hooks/useQuestionTimer";
import { Question } from "@/src/types/assessment.types";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { CARD_SHADOW } from "@/src/components/patient/cognitive/components/screening-test/assessmentUi";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function QuestionScreen() {
  const router = useRouter();
  const {
    session,
    currentQuestion,
    submitAnswer,
    goToNext: handleGoToNext,
    goToPrev: handleGoToPrev,
    markTimeExpired,
    isLoading,
    error,
  } = useAssessmentSession();

  // IMPORTANT: use optional chaining so hooks can run even when currentQuestion is null.
  const isRecallQuestion =
    currentQuestion?.type === "word_recall_display" ||
    currentQuestion?.type === "word_recall_input";

  const handleExpire = useCallback(() => {
    if (isRecallQuestion) return;
    markTimeExpired();
  }, [isRecallQuestion, markTimeExpired]);

  // Hide the Next/Skip footer while typing so the keyboard doesn't squeeze
  // the answer field; each input renderer has its own submit button.
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, () =>
      setKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener(hideEvent, () =>
      setKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const timer = useQuestionTimer({
    limitSeconds: currentQuestion?.timeLimit ?? null,
    onExpire: handleExpire,
  });

  const handleAnswer = useCallback(
    async (answer: any) => {
      if (!currentQuestion) return;
      await submitAnswer(currentQuestion.id, answer);
    },
    [currentQuestion, submitAnswer],
  );

  const handleNext = useCallback(async () => {
    const updated = await handleGoToNext();
    if (updated?.status === "done") {
      router.replace("/patient/cognitive/assessment/results");
    } else {
      const nextIndex =
        updated?.currentQuestionIndex ?? session.currentQuestionIndex + 1;
      router.replace(`/patient/cognitive/assessment/${nextIndex}`);
    }
  }, [handleGoToNext, session.currentQuestionIndex, router]);

  const handleSkip = useCallback(async () => {
    if (!currentQuestion) return;
    await submitAnswer(currentQuestion.id, { skipped: true });
    await handleNext();
  }, [currentQuestion, submitAnswer, handleNext]);

  const handlePrev = useCallback(async () => {
    if (session.currentQuestionIndex > 0) {
      const updated = await handleGoToPrev();
      const prevIndex =
        updated?.currentQuestionIndex ?? session.currentQuestionIndex - 1;
      router.replace(`/patient/cognitive/assessment/${prevIndex}`);
    }
  }, [handleGoToPrev, session.currentQuestionIndex, router]);

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-3 bg-slate-50">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="text-base text-gray-500">Loading questions…</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-3 bg-slate-50 px-8">
        <Ionicons name="cloud-offline-outline" size={48} color="#f43f5e" />
        <Text className="text-center text-base text-rose-600">{error}</Text>
      </SafeAreaView>
    );
  }

  if (!currentQuestion) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-3 bg-slate-50">
        <Ionicons name="help-circle-outline" size={48} color="#9ca3af" />
        <Text className="text-base text-gray-500">No question found.</Text>
      </SafeAreaView>
    );
  }

  const answered = currentQuestion.id in session.answers;
  const canProceed = isRecallQuestion
    ? answered
    : answered || session.timeExpired;
  const canSkip = !answered;
  const isLast = session.currentQuestionIndex === session.totalQuestions - 1;
  const canGoBack = session.currentQuestionIndex > 0;

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "bottom"]}>
      <ProgressBar
        current={session.currentQuestionIndex + 1}
        total={session.totalQuestions}
        sectionName={currentQuestion.section}
      />

      {currentQuestion.timeLimit && (
        <TimerBar
          secondsLeft={timer.secondsLeft}
          isWarning={timer.isWarning}
          timeLimit={currentQuestion.timeLimit}
        />
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="pb-8"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View className="px-6 pt-3 pb-5">
            <Text
              className="text-[26px] font-bold text-gray-900 leading-tight"
              accessibilityRole="header"
            >
              {currentQuestion.prompt}
            </Text>
          </View>

          {renderQuestion(currentQuestion, handleAnswer, timer.secondsLeft)}
        </ScrollView>

        {!keyboardVisible && (
          <View
            className="px-6 pb-4 pt-4 gap-2 bg-white rounded-t-3xl"
            style={CARD_SHADOW}
          >
            <View className="flex-row gap-3">
              {canGoBack && (
                <TouchableOpacity
                  onPress={handlePrev}
                  accessibilityRole="button"
                  accessibilityLabel="Go back to the previous question"
                  className="w-14 items-center justify-center rounded-2xl border-2 border-gray-200 bg-white"
                >
                  <Ionicons name="arrow-back" size={24} color="#4b5563" />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={handleNext}
                disabled={!canProceed}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canProceed }}
                className={`flex-1 flex-row py-4 rounded-2xl items-center justify-center gap-2 ${
                  canProceed ? "bg-blue-500" : "bg-gray-200"
                }`}
              >
                <Text
                  className={`font-bold text-lg ${
                    canProceed ? "text-white" : "text-gray-400"
                  }`}
                >
                  {isLast ? "Finish" : "Next"}
                </Text>
                <Ionicons
                  name={isLast ? "checkmark-done" : "arrow-forward"}
                  size={22}
                  color={canProceed ? "white" : "#9ca3af"}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={handleSkip}
              disabled={!canSkip}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSkip }}
              className="flex-row items-center justify-center gap-1.5 py-2"
            >
              <Ionicons
                name="play-skip-forward-outline"
                size={18}
                color={canSkip ? "#b45309" : "#d1d5db"}
              />
              <Text
                className={`text-base font-semibold ${canSkip ? "text-amber-700" : "text-gray-300"}`}
              >
                Skip this question
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function renderQuestion(
  question: Question,
  onAnswer: (a: any) => void,
  secondsLeft: number,
) {
  switch (question.type) {
    case "mcq":
      return <MCQRenderer question={question} onAnswer={onAnswer} />;
    case "image_mcq":
      return <ImageMcqRenderer question={question} onAnswer={onAnswer} />;
    case "word_recall_display":
    case "word_recall_input":
      return (
        <WordRecallRenderer
          question={question}
          onAnswer={onAnswer}
          secondsLeft={secondsLeft}
          timeLimit={question.timeLimit ?? null}
        />
      );
    case "serial_subtraction":
      return (
        <SerialSubtractionRenderer question={question} onAnswer={onAnswer} />
      );
    case "phrase_repeat":
      return <PhraseRepeatRenderer question={question} onAnswer={onAnswer} />;
    case "text_input":
      return <TextInputRenderer question={question} onAnswer={onAnswer} />;
    case "instruction_action":
      return (
        <InstructionActionRenderer question={question} onAnswer={onAnswer} />
      );
    case "drawing_canvas":
      return <DrawingRenderer question={question} onAnswer={onAnswer} />;
    default:
      return (
        <View className="px-6">
          <Text className="text-gray-400 text-sm">
            Renderer for `{question.type}` coming soon
          </Text>
        </View>
      );
  }
}
