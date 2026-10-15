import { MMSESession, Severity } from "@/src/types/assessment.types";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CircularProgress } from "../../../cognitive/components/games/shared/CircularProgress";
import {
  AIPredictionCard,
  AIPredictionCardHandle,
} from "../../../cognitive/components/screening-test/AIPredictionCard";
import { AiButton } from "../../../cognitive/components/screening-test/triageUi";
import { profileCard, SectionHeader } from "../components/SectionHeader";
import { FaqFormModal } from "./FaqFormModal";

const MMSE_MAX = 30;

// MMSE-derived status (same labels/colors as the Reporting tab).
const SEVERITY_META: Record<Severity, { label: string; color: string; bg: string }> = {
  none: { label: "No Impairment", color: "#16A34A", bg: "#F0FDF4" },
  mild: { label: "Mild Impairment", color: "#D97706", bg: "#FFFBEB" },
  moderate: { label: "Moderate Impairment", color: "#EA580C", bg: "#FFF7ED" },
  severe: { label: "Severe Impairment", color: "#DC2626", bg: "#FEF2F2" },
};

interface SeverityCheckSectionProps {
  patientId: string;
  latestSession: MMSESession | null;
  // False for a caregiver viewing another patient's profile - that flow has
  // no route to hand off to for taking the assessment on the patient's
  // behalf, so the CTA is hidden rather than pointing somewhere that won't work.
  showTakeAssessmentCta?: boolean;
}

// The one place a "run/re-run" AI triage check lives - used identically by a
// patient viewing their own profile and by a caregiver viewing a linked
// patient's profile (both render this same component through
// PatientProfileScreen). See docs/plan for why this replaced the earlier,
// separate caregiver-inline-card design.
export function SeverityCheckSection({
  patientId,
  latestSession,
  showTakeAssessmentCta = true,
}: SeverityCheckSectionProps) {
  const router = useRouter();
  const [faqModalOpen, setFaqModalOpen] = useState(false);
  const cardRef = useRef<AIPredictionCardHandle>(null);

  const score = latestSession
    ? latestSession.adjustedScore ?? latestSession.totalScore
    : null;
  const severity = latestSession ? SEVERITY_META[latestSession.severity] : null;
  const takenOn = latestSession?.completedAt
    ? new Date(latestSession.completedAt).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <View style={profileCard}>
      <SectionHeader
        title="AI Triage Check"
        subtitle="Based on the latest memory assessment"
        icon="sparkles-outline"
        tint="#7C3AED"
        tintSoft="#F3E8FF"
      />

      {!latestSession ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="clipboard-outline" size={34} color="#7C3AED" />
          </View>
          <Text style={styles.emptyTitle}>No assessment yet</Text>
          <Text style={styles.emptyText}>
            The triage check needs one completed memory assessment first.
          </Text>
          {showTakeAssessmentCta && (
            <View style={styles.emptyCta}>
              <AiButton
                label="Take the assessment"
                trailingIcon="arrow-forward"
                onPress={() => router.push("/patient/cognitive/assessment")}
              />
            </View>
          )}
        </View>
      ) : (
        <>
          {/* Latest MMSE score at a glance */}
          <View style={styles.scoreRow}>
            <CircularProgress
              percent={((score ?? 0) / MMSE_MAX) * 100}
              size={92}
              strokeWidth={9}
              color={severity?.color ?? "#7C3AED"}
              trackColor="#EEF2F7"
              label={String(score ?? 0)}
              sublabel={`of ${MMSE_MAX}`}
            />
            <View style={styles.scoreText}>
              <Text style={styles.scoreLabel}>Latest MMSE score</Text>
              {severity && (
                <View style={[styles.severityChip, { backgroundColor: severity.bg }]}>
                  <View style={[styles.severityDot, { backgroundColor: severity.color }]} />
                  <Text style={[styles.severityText, { color: severity.color }]}>
                    {severity.label}
                  </Text>
                </View>
              )}
              {takenOn && (
                <View style={styles.dateRow}>
                  <Ionicons name="time-outline" size={13} color="#94A3B8" />
                  <Text style={styles.dateText}>Taken {takenOn}</Text>
                </View>
              )}
            </View>
          </View>

          <AIPredictionCard
            ref={cardRef}
            patientId={patientId}
            autoRun={false}
            onFaqRequired={() => setFaqModalOpen(true)}
          />

          {/* Re-open the questionnaire any time, not just on the first run.
              Submitting again re-runs the triage, which picks up the latest
              MMSE score and the new answers. */}
          <AiButton
            label="Retake questionnaire"
            icon="refresh"
            variant="secondary"
            onPress={() => setFaqModalOpen(true)}
          />

          <FaqFormModal
            visible={faqModalOpen}
            patientId={patientId}
            onClose={() => setFaqModalOpen(false)}
            onSubmitted={() => {
              setFaqModalOpen(false);
              cardRef.current?.run();
            }}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    paddingVertical: 8,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: "#F5F3FF",
    borderRadius: 999,
    height: 76,
    justifyContent: "center",
    marginBottom: 14,
    width: 76,
  },
  emptyTitle: {
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "800",
  },
  emptyText: {
    color: "#64748B",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    textAlign: "center",
  },
  emptyCta: {
    alignSelf: "stretch",
    marginTop: 18,
  },
  scoreRow: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 20,
    flexDirection: "row",
    marginBottom: 16,
    padding: 14,
  },
  scoreText: {
    flex: 1,
    marginLeft: 16,
  },
  scoreLabel: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  severityChip: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 999,
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  severityDot: {
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  severityText: {
    fontSize: 13,
    fontWeight: "800",
  },
  dateRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    marginTop: 8,
  },
  dateText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
  },
});
