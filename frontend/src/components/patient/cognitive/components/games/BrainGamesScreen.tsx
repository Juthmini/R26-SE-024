import { getPatientGameProgress } from "@/src/api/gameSessionApi";
import { BRAIN_AREA_BY_SECTION } from "@/src/constants/brainAreas";
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
  ActivityIndicator,
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
import {
  AccordionGameRow,
  AREA_ICONS,
  AreaStrength,
  BrainAreaAccordion,
} from "./BrainAreaAccordion";
import { DifficultyBadge } from "./DifficultyBadge";

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

  const playsByGame = useMemo(
    () => new Map<GameId, number>(adaptiveProgress.map((p) => [p.gameId, p.totalSessions])),
    [adaptiveProgress],
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
            plays: playsByGame.get(gameId) ?? 0,
          };
        });
        return acc;
      },
      {} as Record<SectionName, AccordionGameRow[]>,
    );
  }, [difficultyByGame, playsByGame]);

  // Assessment score behind each brain area (same for every game in it).
  const strengthBySection = useMemo(() => {
    const map: Partial<Record<SectionName, AreaStrength>> = {};
    for (const a of gamePlan.assignments) {
      if (a.sectionName !== "Overall" && !map[a.sectionName]) {
        map[a.sectionName] = { score: a.sectionScore, max: a.sectionMax };
      }
    }
    return map;
  }, [gamePlan]);

  const stats = useMemo(() => {
    const all = DOMAIN_ORDER.flatMap((section) => gamesBySection[section] ?? []);
    return {
      totalGames: all.length,
      tried: all.filter((g) => g.plays > 0).length,
      plays: all.reduce((sum, g) => sum + g.plays, 0),
    };
  }, [gamesBySection]);

  // Today's pick: the least-played game in the weakest assessment area.
  const todaysPick = useMemo(() => {
    let weakest: SectionName | null = null;
    let weakestPct = Infinity;
    for (const section of DOMAIN_ORDER) {
      const strength = strengthBySection[section];
      if (!strength || !strength.max || !gamesBySection[section]?.length) continue;
      const pct = strength.score / strength.max;
      if (pct < weakestPct) {
        weakest = section;
        weakestPct = pct;
      }
    }
    if (!weakest) return null;
    const game = [...gamesBySection[weakest]].sort((a, b) => a.plays - b.plays)[0];
    return { section: weakest, game };
  }, [strengthBySection, gamesBySection]);

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
      <View style={styles.screen}>
        <SafeAreaView style={[styles.safeArea, styles.centered]}>
          <View style={styles.bigIcon}>
            <ActivityIndicator size="large" color="#2563eb" />
          </View>
          <Text style={styles.loadingTitle}>Checking your screening status…</Text>
          <Text style={styles.loadingBody}>
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
            <View style={styles.bigIcon}>
              <Ionicons name="clipboard-outline" size={40} color="#2563eb" />
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

  const pickArea = todaysPick ? BRAIN_AREA_BY_SECTION[todaysPick.section] : null;

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 112, paddingTop: 16 }}
        >
          {/* Header */}
          <Animated.View entering={FadeInDown.duration(400)} style={styles.hero}>
            <View style={[styles.bubble, styles.bubbleLarge]} />
            <View style={[styles.bubble, styles.bubbleSmall]} />
            <Text style={styles.heroEyebrow}>Your personalised</Text>
            <Text style={styles.heroTitle}>Game plan</Text>
            <Text style={styles.heroBody}>
              Games grouped by the brain area they exercise.
            </Text>
            <View style={styles.heroStats}>
              <HeroStat icon="game-controller-outline" value={String(stats.plays)} label="Played" />
              <View style={styles.heroDivider} />
              <HeroStat
                icon="checkmark-done-outline"
                value={`${stats.tried}/${stats.totalGames}`}
                label="Tried"
              />
              <View style={styles.heroDivider} />
              <HeroStat icon="git-network-outline" value={String(DOMAIN_ORDER.length)} label="Areas" />
            </View>
          </Animated.View>

          {/* Today's pick */}
          {todaysPick && pickArea && (
            <Animated.View entering={FadeInDown.delay(80).duration(400)} style={styles.pickCard}>
              <View style={styles.pickHeader}>
                <View style={[styles.pickAreaIcon, { backgroundColor: pickArea.color + "1F" }]}>
                  <Ionicons name={AREA_ICONS[todaysPick.section]} size={18} color={pickArea.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickEyebrow}>Today&apos;s pick</Text>
                  <Text style={styles.pickFocus}>Focus on {todaysPick.section}</Text>
                </View>
                <Ionicons name="sparkles" size={18} color="#f59e0b" />
              </View>

              <View style={styles.pickGame}>
                <View style={[styles.pickGameIcon, { backgroundColor: todaysPick.game.tileColor }]}>
                  <Text style={{ fontSize: 30 }}>{todaysPick.game.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickGameTitle} numberOfLines={2}>
                    {todaysPick.game.title}
                  </Text>
                  <View style={{ flexDirection: "row", marginTop: 6 }}>
                    <DifficultyBadge difficulty={todaysPick.game.difficulty} size="sm" />
                  </View>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => handlePlayGame(todaysPick.game.gameId, todaysPick.game.difficulty)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Play today's pick, ${todaysPick.game.title}`}
                style={styles.pickButton}
              >
                <Ionicons name="play" size={18} color="#ffffff" />
                <Text style={styles.pickButtonText}>Play now</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          <Text style={styles.sectionLabel}>All brain areas</Text>

          {DOMAIN_ORDER.map((section, index) => (
            <Animated.View
              key={section}
              entering={FadeInDown.delay(140 + index * 60).duration(360)}
            >
              <BrainAreaAccordion
                section={section}
                games={gamesBySection[section] ?? []}
                strength={strengthBySection[section]}
                expanded={openSection === section}
                onToggle={() => toggleSection(section)}
                onPlayGame={handlePlayGame}
              />
            </Animated.View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function HeroStat({
  icon,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.heroStat}>
      <Ionicons name={icon} size={16} color="#bfdbfe" />
      <Text style={styles.heroStatValue}>{value}</Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f4f7fd",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },
  safeArea: {
    flex: 1,
    backgroundColor: "#f4f7fd",
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  bigIcon: {
    width: 88,
    height: 88,
    borderRadius: 999,
    backgroundColor: "#dbeafe",
    borderColor: "#eff6ff",
    borderWidth: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  loadingTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  loadingBody: {
    color: "#64748b",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
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
    borderRadius: 18,
    backgroundColor: "#2563eb",
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 6,
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
  hero: {
    backgroundColor: "#1d4ed8",
    borderRadius: 28,
    marginBottom: 16,
    marginHorizontal: 20,
    overflow: "hidden",
    padding: 22,
    shadowColor: "#1d4ed8",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  bubble: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 999,
    position: "absolute",
  },
  bubbleLarge: {
    height: 200,
    right: -60,
    top: -80,
    width: 200,
  },
  bubbleSmall: {
    backgroundColor: "rgba(96, 165, 250, 0.25)",
    bottom: -40,
    height: 120,
    left: -36,
    width: 120,
  },
  heroEyebrow: {
    color: "#bfdbfe",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.4,
    marginTop: 2,
  },
  heroBody: {
    color: "#dbeafe",
    fontSize: 14,
    marginTop: 4,
  },
  heroStats: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 18,
    paddingVertical: 12,
  },
  heroStat: {
    alignItems: "center",
    flex: 1,
  },
  heroStatValue: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
  },
  heroStatLabel: {
    color: "#bfdbfe",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginTop: 2,
    textTransform: "uppercase",
  },
  heroDivider: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    height: 32,
    width: 1,
  },
  pickCard: {
    backgroundColor: "#ffffff",
    borderColor: "#fde68a",
    borderRadius: 24,
    borderWidth: 1.5,
    marginBottom: 20,
    marginHorizontal: 20,
    padding: 16,
    shadowColor: "#f59e0b",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 3,
  },
  pickHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  pickAreaIcon: {
    alignItems: "center",
    borderRadius: 12,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  pickEyebrow: {
    color: "#b45309",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  pickFocus: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 1,
  },
  pickGame: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 18,
    flexDirection: "row",
    gap: 14,
    marginTop: 14,
    padding: 12,
  },
  pickGameIcon: {
    alignItems: "center",
    borderRadius: 18,
    height: 60,
    justifyContent: "center",
    width: 60,
  },
  pickGameTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900",
  },
  pickButton: {
    alignItems: "center",
    backgroundColor: "#2563eb",
    borderRadius: 16,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 14,
    minHeight: 52,
  },
  pickButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  sectionLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 10,
    marginHorizontal: 24,
    textTransform: "uppercase",
  },
});
