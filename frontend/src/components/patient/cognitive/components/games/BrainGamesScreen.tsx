import { getPatientGameProgress } from "@/src/api/gameSessionApi";
import { DOMAIN_GAME_POOLS, DOMAIN_ORDER, GAME_CONFIGS } from "@/src/constants/games";
import { useAssessment } from "@/src/context/AssessmentContext";
import {
  Difficulty,
  GameDifficultyAssignment,
  GameId,
  PatientGameProgress,
  SectionName,
} from "@/src/types/games.types";
import { generateGamePlan } from "@/src/utils/difficultyEngine";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router/react-navigation";
import { useAudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { AccordionGameRow, BrainAreaAccordion } from "./BrainAreaAccordion";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function BrainGamesScreen() {
  const router = useRouter();
  const {
    session,
    isLoadingSession,
    hasCompletedAssessment,
    error,
    refreshSession,
    patientId,
  } = useAssessment();
  const gamePlan = useMemo(() => generateGamePlan(session), [session]);

  const [adaptiveProgress, setAdaptiveProgress] = useState<PatientGameProgress[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!patientId) return;
      getPatientGameProgress(patientId)
        .then((progress) => {
          if (!cancelled) setAdaptiveProgress(progress);
        })
        .catch(() => {
          if (!cancelled) setAdaptiveProgress([]);
        });
      return () => {
        cancelled = true;
      };
    }, [patientId]),
  );

  // Once a game has been played at least once, its difficulty is driven by
  // the patient's actual performance (accuracy + speed) rather than the
  // one-time assessment score - the assessment plan is just the starting point.
  const assignments: GameDifficultyAssignment[] = useMemo(() => {
    const progressByGame = new Map(adaptiveProgress.map((p) => [p.gameId, p]));
    return gamePlan.assignments.map((assignment) => {
      const adaptive = progressByGame.get(assignment.gameId);
      if (!adaptive || adaptive.totalSessions === 0) return assignment;

      return {
        ...assignment,
        difficulty: adaptive.difficulty,
        reason:
          adaptive.lastChangeReason ??
          `Adapted from your last ${adaptive.totalSessions} session${adaptive.totalSessions === 1 ? "" : "s"}`,
      };
    });
  }, [gamePlan, adaptiveProgress]);

  const difficultyByGame = useMemo(
    () =>
      new Map<GameId, Difficulty>(
        assignments.map((a) => [a.gameId, a.difficulty]),
      ),
    [assignments],
  );

  // All games for each brain area, resolved with title/icon/difficulty.
  const gamesBySection: Record<SectionName, AccordionGameRow[]> = useMemo(() => {
    return DOMAIN_ORDER.reduce(
      (acc, section) => {
        acc[section] = (DOMAIN_GAME_POOLS[section] ?? []).map((gameId) => {
          const config = GAME_CONFIGS[gameId];
          return {
            gameId,
            title: config.title,
            icon: config.icon,
            tileColor: config.color.tile,
            difficulty: difficultyByGame.get(gameId) ?? "medium",
          };
        });
        return acc;
      },
      {} as Record<SectionName, AccordionGameRow[]>,
    );
  }, [difficultyByGame]);

  // Single-open accordion: opening one area collapses the others.
  const [openSection, setOpenSection] = useState<SectionName | null>(null);

  const toggleSection = useCallback((section: SectionName) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenSection((prev) => (prev === section ? null : section));
  }, []);

  // --- Sound effect setup ---
  // useAudioPlayer loads the sound and frees it automatically on unmount
  const clickPlayer = useAudioPlayer(require("@/assets/audio/click.wav"));

  useFocusEffect(
    useCallback(() => {
      refreshSession();
    }, [refreshSession]),
  );

  const playSound = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await clickPlayer.seekTo(0);
      clickPlayer.play();
    } catch {
      // ignore sound errors
    }
  };
  // --- end sound effect setup ---

  const handlePlayGame = useCallback(
    async (gameId: GameId, difficulty: Difficulty) => {
      await playSound();
      router.push({
        pathname: `/patient/cognitive/games/${gameId}/play`,
        params: { difficulty },
      });
    },
    [router],
  );

  if (isLoadingSession) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#f9fafb",
          paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
        }}
      >
        <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center px-6">
          <View className="w-16 h-16 rounded-2xl bg-blue-100 items-center justify-center mb-5">
            <Ionicons name="clipboard-outline" size={30} color="#3b82f6" />
          </View>
          <Text className="text-lg font-semibold text-gray-900 text-center">
            Checking your screening status...
          </Text>
          <Text className="text-sm text-gray-500 text-center mt-2">
            We are loading your latest assessment result.
          </Text>
        </SafeAreaView>
      </View>
    );
  }

  if (!hasCompletedAssessment) {
    return (
      <View style={styles.screen}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.assessmentPrompt}>
            <View style={styles.promptIcon}>
              <Ionicons name="clipboard-outline" size={32} color="#3b82f6" />
            </View>

            <Text style={styles.promptEyebrow}>Screening Required</Text>
            <Text style={styles.promptTitle}>
              Complete the assessment first
            </Text>
            <Text style={styles.promptBody}>
              Your games are personalized from your screening test results. Take
              the assessment once, then your game plan will appear here.
            </Text>

            {error ? <Text style={styles.promptError}>{error}</Text> : null}

            <TouchableOpacity
              onPress={() => router.push("/patient/cognitive/assessment")}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Go to assessment"
              style={styles.assessmentButton}
            >
              <Ionicons name="arrow-forward" size={20} color="#ffffff" />
              <Text style={styles.assessmentButtonText}>Go to Assessment</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#f9fafb",
        paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
      }}
    >
      <SafeAreaView className="flex-1 bg-gray-50">
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 112 }}
        >
          <Animated.View
            entering={FadeInDown.duration(400)}
            className="px-6 pt-6 pb-4"
          >
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">
              Your Personalized
            </Text>
            <Text className="text-3xl font-bold text-gray-900 mb-1">
              Game Plan
            </Text>
            <Text className="text-sm text-gray-500 mt-1">
              Games grouped by the brain area they exercise. Tap an area to see
              its games.
            </Text>
          </Animated.View>

          {DOMAIN_ORDER.map((section) => (
            <BrainAreaAccordion
              key={section}
              section={section}
              games={gamesBySection[section] ?? []}
              expanded={openSection === section}
              onToggle={() => toggleSection(section)}
              onPlayGame={handlePlayGame}
            />
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f9fafb",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },
  safeArea: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  assessmentPrompt: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 96,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
  },
  promptIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  promptEyebrow: {
    color: "#9ca3af",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  promptTitle: {
    color: "#111827",
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 36,
    marginBottom: 12,
  },
  promptBody: {
    color: "#6b7280",
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 32,
  },
  promptError: {
    color: "#ef4444",
    fontSize: 14,
    marginBottom: 16,
  },
  assessmentButton: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: "#3b82f6",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 16,
    width: "100%",
  },
  assessmentButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 20,
  },
});