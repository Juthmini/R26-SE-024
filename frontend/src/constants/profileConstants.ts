import { GameId } from "@/src/types/games.types";

export type Review = {
  gameId: GameId;
  sessions: number;
  bestScore: string;
  lastPlayed: string;
  review: string;
  // Numbers behind the Game Reviews stories (all percentages, 0-100).
  bestPercent: number;
  averagePercent: number;
  // Up to the last 7 scores, oldest first.
  recentScores: number[];
  // Recent half of plays vs the earlier half; null with a single play.
  trend: number | null;
};
