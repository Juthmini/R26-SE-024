import { FaqQuestionnaire } from "@/src/components/patient/cognitive/components/screening-test/FaqQuestionnaire";
import { submitFaq } from "@/src/services/patient/cognitive/dementiaService";
import { FaqAnswers } from "@/src/types/dementia.types";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { SafeAreaView, Text, TouchableOpacity } from "react-native";

// Functional Activities Questionnaire - shown after the MMSE results screen,
// reached from the "Complete daily-living questionnaire" button. 10 items,
// each rated 0-3 by whoever is with the patient (one friendly question per
// screen, see FaqQuestionnaire). On submit it saves the FAQ and returns to the
// results screen, which then shows the AI triage.
export default function FunctionalActivitiesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ patientId?: string; sessionId?: string }>();
  const patientId = typeof params.patientId === "string" ? params.patientId : "";
  const sessionId =
    typeof params.sessionId === "string" && params.sessionId ? params.sessionId : null;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (answers: FaqAnswers) => {
    if (!patientId) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitFaq(patientId, answers, sessionId);
      router.replace("/patient/cognitive/assessment/results");
    } catch (e: any) {
      setError(e?.message || "Could not save the questionnaire. Try again.");
      setSubmitting(false);
    }
  };

  if (!patientId) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center px-8">
        <Text className="text-base text-gray-600 text-center mb-4">
          Missing patient details. Go back to the results screen and try again.
        </Text>
        <TouchableOpacity
          onPress={() => router.replace("/patient/cognitive/assessment/results")}
          className="px-5 py-3 rounded-2xl bg-blue-500"
        >
          <Text className="text-white font-semibold">Back to results</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-gray-50">
      <FaqQuestionnaire
        submitLabel="Submit & see results"
        submitting={submitting}
        error={error}
        onSubmit={onSubmit}
      />
    </SafeAreaView>
  );
}
