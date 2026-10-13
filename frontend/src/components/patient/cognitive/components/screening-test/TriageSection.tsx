import { getLatestFaq } from "@/src/services/patient/cognitive/dementiaService";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { AIPredictionCard } from "./AIPredictionCard";
import { AI_ACCENT, AiButton, AiCardShell } from "./triageUi";
import { Gradient, GlowIcon, GRADIENTS, IoniconName } from "./visuals";

// Results-screen block for the dementia triage. The triage needs the
// Functional Activities Questionnaire on file, so:
//   - no FAQ yet  -> show a "complete the questionnaire" button
//   - FAQ on file -> render the triage prediction card
interface TriageSectionProps {
  patientId: string;
  sessionId?: string | null;
}

const TEASER_ROWS: { icon: IoniconName; colors: Gradient; text: string }[] = [
  { icon: "list", colors: GRADIENTS.sky, text: "10 quick everyday questions" },
  { icon: "time", colors: GRADIENTS.amber, text: "About 3 minutes" },
  { icon: "flash", colors: GRADIENTS.pink, text: "Result appears right here" },
];

export const TriageSection: React.FC<TriageSectionProps> = ({ patientId, sessionId }) => {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasFaq, setHasFaq] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    const faq = await getLatestFaq(patientId);
    setHasFaq(!!faq);
    setChecking(false);
  }, [patientId]);

  useEffect(() => {
    check();
  }, [check]);

  const openQuestionnaire = () =>
    router.push({
      pathname: "/patient/cognitive/assessment/functional-activities",
      params: { patientId, sessionId: sessionId ?? "" },
    });

  if (checking) {
    return (
      <AiCardShell>
        <View className="items-center py-4">
          <ActivityIndicator size="large" color={AI_ACCENT} />
        </View>
      </AiCardShell>
    );
  }

  if (hasFaq) {
    return (
      <View className="mb-4 w-full max-w-[640px] self-center">
        <AIPredictionCard patientId={patientId} />
        {/* Redo the questionnaire whenever; returning here re-runs the triage
            against the latest MMSE score and the new answers. */}
        <View className="-mt-1">
          <AiButton
            label="Retake questionnaire"
            icon="refresh"
            variant="secondary"
            onPress={openQuestionnaire}
          />
        </View>
      </View>
    );
  }

  return (
    <AiCardShell subtitle="One more short step">
      <Text className="text-xl font-extrabold text-gray-900 mb-1">
        Get your AI triage result
      </Text>
      <Text className="text-base text-gray-600 leading-relaxed mb-4">
        Answer a few questions about day-to-day activities. The AI combines them
        with the MMSE score to suggest keeping an eye at home or seeing a doctor.
      </Text>

      <View className="gap-1 mb-5">
        {TEASER_ROWS.map((row) => (
          <View key={row.text} className="flex-row items-center gap-2">
            <GlowIcon colors={row.colors} icon={row.icon} size={40} />
            <Text className="flex-1 text-base font-semibold text-gray-800">
              {row.text}
            </Text>
          </View>
        ))}
      </View>

      <AiButton
        label="Answer 10 questions"
        trailingIcon="arrow-forward"
        onPress={openQuestionnaire}
      />
    </AiCardShell>
  );
};
