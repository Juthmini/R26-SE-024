import {
  CARD_SHADOW,
  getSectionTheme,
} from "@/src/components/patient/cognitive/components/screening-test/assessmentUi";
import { TriageSection } from "@/src/components/patient/cognitive/components/screening-test/TriageSection";
import { useAssessmentSession } from "@/src/hooks/useAssessmentSession";
import { Question, Severity } from "@/src/types/assessment.types";
import {
  Bubbles,
  Gradient,
  GlowIcon,
  GRADIENTS,
  GradientButton,
  GradientView,
  ScoreRing,
} from "@/src/components/patient/cognitive/components/screening-test/visuals";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  LayoutAnimation,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

// Section max scores - fixed MMSE values
const SECTION_MAX: Record<string, number> = {
  Orientation: 10,
  Registration: 3,
  Attention: 5,
  Recall: 3,
  Language: 9,
};

const MAX_SCORE = 30;
const IMPAIRMENT_THRESHOLD = 23;

// Up to 3 decimals, without trailing zeros (27 → "27", 26.5 → "26.5").
const formatScore = (value: number) => String(Number(Number(value).toFixed(3)));

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const SEVERITY_BANDS: {
  key: Severity;
  range: string;
  label: string;
  dot: string;
  pillBg: string;
  pillText: string;
  accent: string;
  icon: IconName;
  hero: Gradient;
}[] = [
  {
    key: "none",
    range: "24 – 30",
    label: "No Impairment",
    dot: "bg-emerald-500",
    pillBg: "bg-emerald-100",
    pillText: "text-emerald-700",
    accent: "#10b981",
    icon: "happy",
    hero: ["#10b981", "#0d9488", "#0e7490"],
  },
  {
    key: "mild",
    range: "19 – 23",
    label: "Mild Impairment",
    dot: "bg-amber-400",
    pillBg: "bg-amber-100",
    pillText: "text-amber-700",
    accent: "#f59e0b",
    icon: "alert-circle",
    hero: ["#f59e0b", "#f97316", "#ea580c"],
  },
  {
    key: "moderate",
    range: "10 – 18",
    label: "Moderate Impairment",
    dot: "bg-orange-500",
    pillBg: "bg-orange-100",
    pillText: "text-orange-700",
    accent: "#f97316",
    icon: "warning",
    hero: ["#fb923c", "#ea580c", "#dc2626"],
  },
  {
    key: "severe",
    range: "0 – 9",
    label: "Severe Impairment",
    dot: "bg-rose-500",
    pillBg: "bg-rose-100",
    pillText: "text-rose-700",
    accent: "#f43f5e",
    icon: "medkit",
    hero: ["#f43f5e", "#e11d48", "#9f1239"],
  },
];

const MODE_LABEL: Record<string, string> = {
  self: "Self-administered",
  assisted: "Caregiver-assisted",
};

// ── Human-readable answer helpers for the "mistakes" breakdown ──────
function describeUserAnswer(q: Question, answer: any): string {
  if (answer == null) return "No answer given";
  if (typeof answer === "object" && (answer as any).skipped) return "Skipped";

  switch (q.type) {
    case "mcq":
    case "image_mcq":
      return String(answer);
    case "serial_subtraction":
      return Array.isArray(answer)
        ? answer.map((x) => (x === "" || x == null ? "-" : x)).join(", ")
        : String(answer);
    case "word_recall_display":
    case "word_recall_input":
      return Array.isArray(answer) && answer.length
        ? answer.join(", ")
        : "No words recalled";
    case "instruction_action":
      return answer === "correct"
        ? "Instruction followed"
        : "Instruction not followed";
    case "phrase_repeat":
      return answer === "correct"
        ? "Repeated correctly"
        : "Not repeated correctly";
    case "drawing_canvas":
      return answer === true ? "Drawing accepted" : "Drawing not accepted";
    case "text_input":
      return typeof answer === "string" && answer.trim()
        ? `“${answer.trim()}”`
        : "No answer given";
    default:
      return String(answer);
  }
}

function describeExpected(q: Question): string {
  switch (q.type) {
    case "mcq":
    case "image_mcq":
    case "serial_subtraction":
      return (q.expectedAnswers ?? []).join(", ");
    case "word_recall_display":
    case "word_recall_input":
      return (q.words ?? []).join(", ");
    case "instruction_action":
      return "Instruction performed correctly";
    case "phrase_repeat":
      return "Phrase repeated exactly";
    case "drawing_canvas":
      return q.figureName || "Two overlapping five-sided figures";
    case "text_input":
      return "A complete, sensible sentence";
    default:
      return "";
  }
}

// A short note on how each question type is marked, so the breakdown explains
// why points were awarded or lost.
function markingRule(q: Question): string {
  switch (q.type) {
    case "mcq":
    case "image_mcq":
      return "Full marks only for the correct option.";
    case "serial_subtraction":
      return "1 point per correct subtraction of 7, counted from your previous answer.";
    case "word_recall_display":
    case "word_recall_input":
      return "1 point for each of the three words recalled.";
    case "instruction_action":
      return "Marked correct/incorrect by the caregiver.";
    case "phrase_repeat":
      return "Marked correct/incorrect by the caregiver.";
    case "drawing_canvas":
      return "Marked correct/incorrect by the caregiver.";
    case "text_input":
      return "1 mark for a complete, sensible sentence.";
    default:
      return "";
  }
}

export default function ResultsScreen() {
  const router = useRouter();
  const { session, questions } = useAssessmentSession();

  // ── Move ALL hooks to top - BEFORE any conditional logic ──────
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  // ── NOW you can do conditional checks ──────────────────────────
  if (session.status !== "done") {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 items-center justify-center gap-3 px-8">
        <Ionicons name="document-text-outline" size={48} color="#9ca3af" />
        <Text className="text-base text-gray-500 text-center">
          No completed assessment found.
        </Text>
        <TouchableOpacity
          onPress={() => router.replace("/patient/cognitive/assessment")}
          className="mt-2 bg-blue-500 rounded-2xl px-6 py-3"
        >
          <Text className="text-white font-semibold text-base">
            Start Assessment
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Per-question earned marks (from the backend scoring log), keyed by id.
  const earnedByQuestion: Record<string, number> = {};
  (session.scoringLog ?? []).forEach((entry) => {
    earnedByQuestion[entry.questionId] = entry.earned;
  });

  // Group the assessment questions under their section for the breakdown.
  const questionsBySection: Record<string, Question[]> = {};
  (questions ?? []).forEach((q) => {
    (questionsBySection[q.section] ??= []).push(q);
  });

  const band =
    SEVERITY_BANDS.find((b) => b.key === session.severity) ?? SEVERITY_BANDS[0];

  const durationMin = session.completedAt
    ? Math.round(
        (new Date(session.completedAt).getTime() -
          new Date(session.startedAt).getTime()) /
          60000,
      )
    : null;

  const toggleSection = (section: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSection((prev) => (prev === section ? null : section));
  };

  const sessionRows: { icon: IconName; label: string; value: string }[] = [
    {
      icon: "calendar",
      label: "Started",
      value: new Date(session.startedAt).toLocaleString(),
    },
    {
      icon: "hourglass",
      label: "Duration",
      value:
        durationMin === null
          ? "-"
          : durationMin < 1
            ? "Under 1 min"
            : `${durationMin} min`,
    },
    {
      icon: "person",
      label: "Mode",
      value:
        MODE_LABEL[session.administrationMode] ?? session.administrationMode,
    },
    {
      icon: "finger-print",
      label: "Session ID",
      value: session.sessionId.slice(0, 8) + "…",
    },
  ];

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["bottom"]}>
      <ScrollView
        contentContainerClassName="pb-10"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Gradient hero with score ring ──────────────── */}
        <GradientView
          colors={band.hero}
          className="items-center px-6 pb-14"
          style={{ paddingTop: insets.top + 20 }}
        >
          <Bubbles />
          <View className="flex-row items-center gap-1.5 self-center rounded-full border border-white/30 bg-white/20 px-3 py-1.5 mb-2">
            <Ionicons name="checkmark-circle" size={16} color="white" />
            <Text className="text-sm font-semibold text-white">
              Assessment complete
            </Text>
          </View>
          <Text className="text-2xl font-extrabold text-white mb-5">
            MMSE Results
          </Text>

          <ScoreRing
            value={session.totalScore}
            max={MAX_SCORE}
            colors={["#ffffff", "#ffffff"]}
            size={190}
            stroke={16}
          >
            <Text
              className="text-6xl font-extrabold text-white"
              style={{ lineHeight: 68 }}
              accessibilityLabel={`Score ${formatScore(session.totalScore)} out of ${MAX_SCORE}`}
            >
              {formatScore(session.totalScore)}
            </Text>
            <Text className="text-base font-semibold text-white/80">
              out of {MAX_SCORE}
            </Text>
          </ScoreRing>

          <View
            className="flex-row items-center gap-1.5 rounded-full bg-white px-4 py-2 mt-5"
            style={{
              shadowColor: "#000",
              shadowOpacity: 0.12,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 3 },
              elevation: 3,
            }}
          >
            <Ionicons name={band.icon} size={18} color={band.accent} />
            <Text className={`text-base font-bold ${band.pillText}`}>
              {band.label}
            </Text>
          </View>

          <Text className="text-sm text-white/80 mt-3">
            Impairment threshold: {IMPAIRMENT_THRESHOLD}
            {session.completedAt
              ? `  ·  ${new Date(session.completedAt).toLocaleDateString()}`
              : ""}
          </Text>
        </GradientView>

        {/* Content sheet overlapping the hero */}
        <View className="-mt-8 rounded-t-[32px] bg-slate-50 pt-6">
          {/* ── Impairment flag banner ─────────────────────────── */}
          {session.impairmentFlag && (
            <View className="mx-6 bg-rose-50 border border-rose-100 rounded-3xl px-3 py-3 mb-4 flex-row items-center gap-2">
              <GlowIcon colors={GRADIENTS.rose} icon="warning" size={42} />
              <Text className="text-base text-rose-800 flex-1 leading-relaxed">
                Score is at or below the impairment threshold of{" "}
                {IMPAIRMENT_THRESHOLD}. Clinical review is recommended.
              </Text>
            </View>
          )}

          {/* ── AI triage prediction (ML model) ── */}
          {session.patientId && (
            <View className="mx-6">
              <TriageSection
                patientId={session.patientId}
                sessionId={session.sessionId}
              />
            </View>
          )}

          {/* ── Section breakdown ──────────────────────────────── */}
          <View className="mx-6 mb-4">
            <Text className="text-lg font-bold text-gray-900">
              Score Breakdown
            </Text>
            <Text className="text-sm text-gray-500 mb-3">
              Tap a section to see mistakes and how they affected the score.
            </Text>
            <View className="gap-3">
              {Object.entries(session.sectionScores).map(([section, score]) => {
                const max = SECTION_MAX[section] ?? 0;
                const pct = max > 0 ? Math.min(100, (score / max) * 100) : 0;
                const isOpen = expandedSection === section;
                const theme = getSectionTheme(section);

                const sectionQuestions = questionsBySection[section] ?? [];
                const mistakes = sectionQuestions.filter(
                  (q) => (earnedByQuestion[q.id] ?? 0) < q.maxScore,
                );

                return (
                  <View
                    key={section}
                    className="bg-white rounded-2xl overflow-hidden"
                    style={CARD_SHADOW}
                  >
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => toggleSection(section)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: isOpen }}
                      className="px-4 py-4"
                    >
                      <View className="flex-row items-center gap-3 mb-3">
                        <GlowIcon
                          colors={theme.gradient}
                          icon={theme.solidIcon}
                          size={44}
                          glow={false}
                        />
                        <View className="flex-1">
                          <Text className="text-base font-semibold text-gray-900">
                            {section}
                          </Text>
                          {mistakes.length > 0 ? (
                            <Text className="text-sm text-rose-600">
                              {mistakes.length} issue
                              {mistakes.length > 1 ? "s" : ""}
                            </Text>
                          ) : (
                            <Text className="text-sm text-emerald-600">
                              Full marks
                            </Text>
                          )}
                        </View>
                        <Text className="text-lg font-bold text-gray-900">
                          {formatScore(score)}
                          <Text className="text-base font-medium text-gray-400">
                            {" "}
                            / {formatScore(max)}
                          </Text>
                        </Text>
                        <Ionicons
                          name={isOpen ? "chevron-up" : "chevron-down"}
                          size={20}
                          color="#9ca3af"
                        />
                      </View>

                      {/* Per-section mini bar */}
                      <View className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <GradientView
                          colors={theme.gradient}
                          diagonal={false}
                          className="h-full rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </View>
                    </TouchableOpacity>

                    {/* ── Dropdown: mistakes & marking impact ──────── */}
                    {isOpen && (
                      <View className="px-4 pb-4 pt-1 border-t border-gray-100 bg-slate-50">
                        {sectionQuestions.length === 0 ? (
                          <Text className="text-sm text-gray-500 pt-3">
                            No detail available for this section.
                          </Text>
                        ) : mistakes.length === 0 ? (
                          <View className="flex-row items-center gap-2 pt-3">
                            <Ionicons
                              name="checkmark-circle"
                              size={20}
                              color="#059669"
                            />
                            <Text className="text-sm text-gray-600 flex-1">
                              All questions answered correctly - no marks lost
                              here.
                            </Text>
                          </View>
                        ) : (
                          mistakes.map((q) => {
                            const earned = earnedByQuestion[q.id] ?? 0;
                            const lost = q.maxScore - earned;
                            const answer = session.answers?.[q.id];
                            const expected = describeExpected(q);
                            return (
                              <View
                                key={q.id}
                                className="bg-white rounded-xl border border-gray-100 p-3 gap-2 mt-3"
                              >
                                <View className="flex-row justify-between items-start gap-2">
                                  <Text className="text-base font-semibold text-gray-800 flex-1">
                                    {q.prompt}
                                  </Text>
                                  <View className="bg-rose-50 rounded-lg px-2 py-1">
                                    <Text className="text-xs font-bold text-rose-600">
                                      −{formatScore(lost)} pt
                                      {lost > 1 ? "s" : ""}
                                    </Text>
                                  </View>
                                </View>

                                <DetailRow
                                  icon="close-circle-outline"
                                  iconColor="#e11d48"
                                  label="Answered"
                                  value={describeUserAnswer(q, answer)}
                                />
                                {!!expected && (
                                  <DetailRow
                                    icon="checkmark-circle-outline"
                                    iconColor="#059669"
                                    label="Expected"
                                    value={expected}
                                    valueClass="text-emerald-700"
                                  />
                                )}
                                <DetailRow
                                  icon="information-circle-outline"
                                  iconColor="#6b7280"
                                  label="Score"
                                  value={`${formatScore(earned)} / ${q.maxScore} · ${markingRule(q)}`}
                                  valueClass="text-gray-500"
                                />
                              </View>
                            );
                          })
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>

          {/* ── Severity scale reference ───────────────────────── */}
          <View className="mx-6 mb-4">
            <Text className="text-lg font-bold text-gray-900 mb-3">
              MMSE Severity Scale
            </Text>
            <View
              className="bg-white rounded-2xl overflow-hidden p-2 gap-1"
              style={CARD_SHADOW}
            >
              {SEVERITY_BANDS.map((b) => {
                const isCurrent = b.key === band.key;
                return (
                  <View
                    key={b.key}
                    className={`flex-row items-center px-3 py-3 gap-3 rounded-xl ${
                      isCurrent ? b.pillBg : ""
                    }`}
                  >
                    <View className={`w-3 h-3 rounded-full ${b.dot}`} />
                    <Text
                      className={`flex-1 text-base ${
                        isCurrent ? `font-bold ${b.pillText}` : "text-gray-600"
                      }`}
                    >
                      {b.label}
                      {isCurrent ? "  ·  Your result" : ""}
                    </Text>
                    <Text
                      className={`text-base ${
                        isCurrent
                          ? `font-semibold ${b.pillText}`
                          : "text-gray-400"
                      }`}
                    >
                      {b.range}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* ── Session metadata ───────────────────────────────── */}
          <View className="mx-6 mb-6">
            <Text className="text-lg font-bold text-gray-900 mb-3">
              Session Details
            </Text>
            <View
              className="bg-white rounded-2xl overflow-hidden"
              style={CARD_SHADOW}
            >
              {sessionRows.map((row, index, arr) => (
                <View
                  key={row.label}
                  className={`flex-row items-center gap-3 px-4 py-3.5 ${
                    index !== arr.length - 1 ? "border-b border-gray-100" : ""
                  }`}
                >
                  <View className="w-9 h-9 rounded-xl bg-indigo-50 items-center justify-center">
                    <Ionicons name={row.icon} size={18} color="#6366f1" />
                  </View>
                  <Text className="text-base text-gray-500">{row.label}</Text>
                  <Text className="flex-1 text-right text-base font-medium text-gray-800">
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── Action buttons ─────────────────────────────────── */}
          <View className="mx-6 gap-3">
            {/* go back to patient dashboard */}
            <GradientButton
              label="Return to Activities"
              colors={GRADIENTS.primary}
              icon="home"
              onPress={() => router.replace("/patient/games")}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({
  icon,
  iconColor,
  label,
  value,
  valueClass = "text-gray-700",
}: {
  icon: IconName;
  iconColor: string;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <View className="flex-row items-start gap-2">
      <Ionicons
        name={icon}
        size={18}
        color={iconColor}
        style={{ marginTop: 1 }}
      />
      <Text className="text-sm text-gray-400 w-[70px]">{label}</Text>
      <Text className={`text-sm flex-1 ${valueClass}`}>{value}</Text>
    </View>
  );
}
