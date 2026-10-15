import { Colors } from "@/src/constants/colors";
import { GAME_CONFIGS } from "@/src/constants/games";
import { Review } from "@/src/constants/profileConstants";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { profileCard, SectionHeader } from "../components/SectionHeader";

type GameReviewsSectionProps = {
  reviews: Review[];
};

const TILE_WIDTH = 136;
const BARS_HEIGHT = 28;
// Card padding - the carousel bleeds to the card edges so tiles scroll
// cleanly under them instead of being clipped inside the padding.
const CARD_PADDING = 20;

// Horizontal carousel of compact game tiles: best score up front, the trend
// and the last few scores as mini bars. Everything is visible without a tap.
export function GameReviewsSection({ reviews }: GameReviewsSectionProps) {
  return (
    <View style={profileCard}>
      <SectionHeader
        title="Game Reviews"
        subtitle="Best score per brain game"
        icon="trophy-outline"
        tint="#D97706"
        tintSoft="#FEF3C7"
        right={
          reviews.length > 0 ? (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>
                {reviews.length} {reviews.length === 1 ? "game" : "games"}
              </Text>
            </View>
          ) : null
        }
      />
      {reviews.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="game-controller-outline" size={30} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No completed games yet.</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.carousel}
          contentContainerStyle={styles.carouselContent}
          snapToInterval={TILE_WIDTH + 12}
          decelerationRate="fast"
        >
          {reviews.map((item) => (
            <GameTile key={item.gameId} item={item} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function GameTile({ item }: { item: Review }) {
  const game = GAME_CONFIGS[item.gameId];
  const tint = game.color.tile;
  const plays = `${item.sessions} ${item.sessions === 1 ? "play" : "plays"}`;

  return (
    <View
      style={[styles.tile, { borderTopColor: tint }]}
      accessible
      accessibilityLabel={`${game.title}: best ${item.bestPercent}%, ${plays}, last played ${item.lastPlayed}. ${item.review}`}
    >
      <View style={styles.tileTop}>
        <View style={[styles.gameIcon, { backgroundColor: `${tint}1F` }]}>
          <Text style={styles.gameEmoji}>{game.icon}</Text>
        </View>
        <TrendChip trend={item.trend} />
      </View>

      <Text style={styles.gameTitle} numberOfLines={1}>
        {game.title}
      </Text>
      <View style={styles.scoreRow}>
        <Text style={styles.bestScore}>{item.bestPercent}</Text>
        <Text style={styles.bestPercent}>%</Text>
        <Text style={styles.bestLabel}>best</Text>
      </View>

      <MiniBars scores={item.recentScores} tint={tint} />

      <Text style={styles.meta} numberOfLines={1}>
        {plays} · {item.lastPlayed}
      </Text>
    </View>
  );
}

function TrendChip({ trend }: { trend: number | null }) {
  if (trend === null) {
    return (
      <View style={[styles.trendChip, { backgroundColor: "#EEF2FF" }]}>
        <Text style={[styles.trendText, { color: "#4F46E5" }]}>New</Text>
      </View>
    );
  }
  const up = trend > 0;
  const flat = trend === 0;
  const color = flat ? "#64748B" : up ? "#16A34A" : "#DC2626";
  const bg = flat ? "#F1F5F9" : up ? "#F0FDF4" : "#FEF2F2";
  return (
    <View style={[styles.trendChip, { backgroundColor: bg }]}>
      {!flat && (
        <Ionicons name={up ? "arrow-up" : "arrow-down"} size={11} color={color} />
      )}
      <Text style={[styles.trendText, { color }]}>
        {flat ? "Steady" : `${Math.abs(trend)}%`}
      </Text>
    </View>
  );
}

// Last few scores, oldest first; the newest bar is drawn solid.
function MiniBars({ scores, tint }: { scores: number[]; tint: string }) {
  return (
    <View style={styles.bars}>
      {scores.map((score, i) => {
        const latest = i === scores.length - 1;
        return (
          <View
            key={i}
            style={[
              styles.bar,
              {
                backgroundColor: latest ? tint : `${tint}55`,
                height: Math.max(3, (Math.min(score, 100) / 100) * BARS_HEIGHT),
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  countBadge: {
    backgroundColor: "#FEF3C7",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countText: {
    color: "#B45309",
    fontSize: 12,
    fontWeight: "800",
  },
  empty: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  carousel: {
    marginHorizontal: -CARD_PADDING,
  },
  carouselContent: {
    gap: 12,
    paddingHorizontal: CARD_PADDING,
    paddingBottom: 2,
  },
  tile: {
    backgroundColor: "#F8FAFC",
    borderColor: "#EEF2F7",
    borderRadius: 18,
    borderTopWidth: 4,
    borderWidth: 1,
    padding: 12,
    width: TILE_WIDTH,
  },
  tileTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  gameIcon: {
    alignItems: "center",
    borderRadius: 12,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  gameEmoji: {
    fontSize: 20,
  },
  trendChip: {
    alignItems: "center",
    borderRadius: 999,
    flexDirection: "row",
    gap: 2,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  trendText: {
    fontSize: 11,
    fontWeight: "800",
  },
  gameTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 10,
  },
  scoreRow: {
    alignItems: "baseline",
    flexDirection: "row",
    marginTop: 2,
  },
  bestScore: {
    color: Colors.textPrimary,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  bestPercent: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: "800",
  },
  bestLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 6,
  },
  bars: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 3,
    height: BARS_HEIGHT,
    marginTop: 8,
  },
  bar: {
    borderRadius: 3,
    flex: 1,
    maxWidth: 12,
  },
  meta: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 8,
  },
});
