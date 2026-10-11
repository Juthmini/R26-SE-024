import { FaqQuestionnaire } from "@/src/components/patient/cognitive/components/screening-test/FaqQuestionnaire";
import { submitFaq } from "@/src/services/patient/cognitive/dementiaService";
import { FaqAnswers } from "@/src/types/dementia.types";
import React, { useState } from "react";
import { Modal, SafeAreaView } from "react-native";

// In-page version of the patient-side Daily-Living Questionnaire
// (frontend/app/patient/cognitive/assessment/functional-activities.tsx),
// used wherever a "Run Check" needs the FAQ but there's no separate route to
// navigate to for it (the profile screen, and a caregiver viewing a linked
// patient's profile) - same questions/choices/submit call, shown as a modal.
interface FaqFormModalProps {
  visible: boolean;
  patientId: string;
  onClose: () => void;
  onSubmitted: () => void;
}

export const FaqFormModal: React.FC<FaqFormModalProps> = ({
  visible,
  patientId,
  onClose,
  onSubmitted,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (answers: FaqAnswers) => {
    if (!patientId) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitFaq(patientId, answers);
      setSubmitting(false);
      onSubmitted();
    } catch (e: any) {
      setError(e?.message || "Could not save the questionnaire. Try again.");
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1 }} className="bg-gray-50">
        {/* Mounted only while open, so every visit starts from the intro with
            no answers - matching the old "clear answers after submit". */}
        {visible ? (
          <FaqQuestionnaire
            submitLabel="Submit & run check"
            submitting={submitting}
            error={error}
            onSubmit={onSubmit}
            onClose={onClose}
          />
        ) : null}
      </SafeAreaView>
    </Modal>
  );
};
