import { BRAIN_AREA_BY_SECTION } from "@/src/constants/brainAreas";
import { Difficulty, GameId, SectionName } from "@/src/types/games.types";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { DifficultyBadge } from "./DifficultyBadge";

export interface AccordionGameRow {
  gameId: GameId;
  title: string;
  icon: string;
  tileColor: string;
  difficulty: Difficulty;
  // Completed sessions so far - 0 shows a "New" tag.
  plays: number;
}

// The assessment score behind this brain area, e.g. Recall 2/3.
export interface AreaStrength {
  score: number;
  max: number;
}

export const AREA_ICONS: Record<SectionName, keyof typeof Ionicons.glyphMap> = {
  Orientation: "compass-outline",
  Registration: "bulb-outline",
  Attention: "eye-outline",
  Recall: "albums-outline",
  Language: "chatbubbles-outline",
};

interface Props {
  section: SectionName;
  games: AccordionGameRow[];
  strength?: AreaStrength;
  expanded: boolean;
  onToggle: () => void;
  onPlayGame: (gameId: GameId, difficulty: Difficulty) => void;
}

// One full-width dropdown for a single brain area. Collapsed it shows the
// area, its assessment strength and game count; expanded it shows every game
// that targets that area as a 2-column grid of tiles, each starting the game.
export function BrainAreaAccordion({
  section,
  games,
  strength,
  expanded,
  onToggle,
  onPlayGame,
}: Props) {
  const area = BRAIN_AREA_BY_SECTION[section];
  const strengthPct = strength && strength.max > 0 ? strength.score / strength.max : null;

  return (
    <View style={[styles.card, expanded && { borderColor: area.color + "55" }]}>
      {/* Header */}
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${section} games, ${games.length} game${games.length === 1 ? "" : "s"}`}
        style={styles.header}
      >
        <View style={[styles.areaIcon, { backgroundColor: area.color + "1F" }]}>
          <Ionicons name={AREA_ICONS[section]} size={24} color={area.color} />
        </View>

        <View style={styles.headerText}>
          <Text style={styles.areaTitle}>{section}</Text>
          <Text style={styles.areaSubtitle} numberOfLines={1}>
            {area.shortArea}
          </Text>
          {strengthPct !== null && strength && (
            <View style={styles.strengthRow}>
              <View style={styles.strengthTrack}>
                <View
                  style={[
                    styles.strengthFill,
                    {
                      backgroundColor: area.color,
                      width: `${Math.max(4, Math.min(1, strengthPct) * 100)}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.strengthText}>
                {strength.score}/{strength.max} in assessment
              </Text>
            </View>
          )}
        </View>

        <View style={styles.headerRight}>
          <View style={styles.countPill}>
            <Text style={styles.countText}>
              {games.length} game{games.length === 1 ? "" : "s"}
            </Text>
          </View>
          <View style={[styles.chevron, expanded && { backgroundColor: area.color }]}>
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={expanded ? "#ffffff" : "#64748b"}
            />
          </View>
        </View>
      </TouchableOpacity>

      {/* Body */}
      {expanded ? (
        <View style={styles.body}>
          {games.length === 0 ? (
            <Text style={styles.emptyText}>No games in this area yet.</Text>
          ) : (
            <View style={styles.grid}>
              {games.map((game, index) => (
                <Animated.View
                  key={game.gameId}
                  entering={FadeInDown.delay(index * 45).duration(260)}
                  style={styles.gridCell}
                >
                  <GameTile game={game} onPress={() => onPlayGame(game.gameId, game.difficulty)} />
                </Animated.View>
              ))}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

function GameTile({ game, onPress }: { game: AccordionGameRow; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Play ${game.title}, ${game.difficulty} difficulty`}
      style={styles.tile}
    >
      <View style={styles.tileTop}>
        <View style={[styles.tileIcon, { backgroundColor: game.tileColor }]}>
          <Text style={styles.tileEmoji}>{game.icon}</Text>
        </View>
        {game.plays === 0 ? (
          <View style={styles.newTag}>
            <Text style={styles.newTagText}>New</Text>
          </View>
        ) : (
          <Text style={styles.playsText}>{game.plays}× played</Text>
        )}
      </View>

      <Text style={styles.tileTitle} numberOfLines={2}>
        {game.title}
      </Text>

      <View style={styles.tileBottom}>
        <DifficultyBadge difficulty={game.difficulty} size="sm" />
        <View style={[styles.playButton, { backgroundColor: game.tileColor }]}>
          <Ionicons name="play" size={12} color="#ffffff" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#eef2f7",
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 12,
    marginHorizontal: 20,
    overflow: "hidden",
    shadowColor: "#1e3a8a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    padding: 16,
  },
  areaIcon: {
    alignItems: "center",
    borderRadius: 16,
    height: 50,
    justifyContent: "center",
    marginRight: 12,
    width: 50,
  },
  headerText: {
    flex: 1,
    paddingRight: 8,
  },
  areaTitle: {
    color: "#0f172a",
    fontSize: 17,
    fontWeight: "800",
  },
  areaSubtitle: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 1,
  },
  strengthRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  strengthTrack: {
    backgroundColor: "#eef2f7",
    borderRadius: 999,
    flex: 1,
    height: 6,
    maxWidth: 90,
    overflow: "hidden",
  },
  strengthFill: {
    borderRadius: 999,
    height: 6,
  },
  strengthText: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "700",
  },
  headerRight: {
    alignItems: "flex-end",
    gap: 8,
  },
  countPill: {
    backgroundColor: "#f1f5f9",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
  },
  chevron: {
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 999,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  body: {
    paddingBottom: 14,
    paddingHorizontal: 14,
  },
  emptyText: {
    color: "#94a3b8",
    fontSize: 14,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
  },
  gridCell: {
    width: "48.5%",
  },
  tile: {
    backgroundColor: "#f8fafc",
    borderColor: "#eef2f7",
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 150,
    padding: 12,
  },
  tileTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  tileIcon: {
    alignItems: "center",
    borderRadius: 14,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  tileEmoji: {
    fontSize: 24,
  },
  newTag: {
    backgroundColor: "#eef2ff",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  newTagText: {
    color: "#4f46e5",
    fontSize: 11,
    fontWeight: "800",
  },
  playsText: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "700",
  },
  tileTitle: {
    color: "#0f172a",
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
    marginTop: 10,
  },
  tileBottom: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  playButton: {
    alignItems: "center",
    borderRadius: 999,
    height: 26,
    justifyContent: "center",
    width: 26,
  },
});
