import { getPatientAssessmentHistory } from "@/src/api/assessmentApi";
import {
  GameSessionHistoryItem,
  getPatientGameSessions,
} from "@/src/api/gameSessionApi";
import { GAME_ORDER } from "@/src/constants/games";
import { Review } from "@/src/constants/profileConstants";
import { getMe, getStoredUser } from "@/src/api/authApi";
import { MMSESession, Severity } from "@/src/types/assessment.types";
import { GameId } from "@/src/types/games.types";
import { loadActiveSession } from "@/src/utils/sessionStorage";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";

export type UserProfile = {
  id?: string;
  fullName?: string;
  email?: string;
  age?: string | number;
  gender?: string;
};

export type ScreeningRow = {
  section: string;
  score: number;
  max: number;
  percent: number;
};

const SECTION_MAX: Record<keyof MMSESession["sectionScores"], number> = {
  Orientation: 10,
  Registration: 3,
  Attention: 5,
  Recall: 3,
  Language: 9,
};

const fallbackUser: UserProfile = {
  fullName: "Patient",
  email: "Not available",
  age: "Not set",
  gender: "Not set",
};

function getScorePercent(session: Pick<GameSessionHistoryItem, "score" | "maxScore">) {
  if (!session.maxScore) return 0;
  return Math.round((session.score / session.maxScore) * 100);
}

function formatRelativeDate(value?: string) {
  if (!value) return "Not played";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not played";

  const today = new Date();
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const startOfDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const daysAgo = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / 86400000,
  );

  if (daysAgo <= 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo < 7) return `${daysAgo} days ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getGameReview(averageScore: number, sessions: number) {
  if (averageScore >= 85) {
    return "Excellent recent performance. Keep the routine steady.";
  }
  if (averageScore >= 70) {
    return "Good progress overall. Short daily practice should help maintain it.";
  }
  if (averageScore >= 50) {
    return "Some areas need support. Try easier rounds and repeat familiar tasks.";
  }
  return sessions > 1
    ? "This game may need caregiver guidance and shorter sessions."
    : "A few more plays are needed before a clear pattern appears.";
}

/**
 * @param explicitPatientId When given (e.g. a caregiver viewing a linked
 *   patient's profile), loads that patient's data instead of the logged-in
 *   user's own - `getMe()`/`getStoredUser()` only ever return the CALLER's
 *   account, so they're skipped entirely in this mode, and so is the
 *   local-device "active session" check (that's only ever this device's own
 *   in-progress session, never another patient's).
 * @param seedUser Basic display fields (name/age/gender) the caller already
 *   has on hand (e.g. from the caregiver's own patient list) - used to seed
 *   the profile header immediately, since there's no "fetch any patient's
 *   account" endpoint to call in explicit mode.
 */
export function usePatientProfile(
  explicitPatientId?: string,
  seedUser?: Partial<UserProfile>,
) {
  const [user, setUser] = useState<UserProfile>(
    explicitPatientId
      ? { ...fallbackUser, ...seedUser, id: explicitPatientId }
      : fallbackUser,
  );
  const [latestSession, setLatestSession] = useState<MMSESession | null>(null);
  const [gameSessions, setGameSessions] = useState<GameSessionHistoryItem[]>([]);
  const [loadingScreening, setLoadingScreening] = useState(true);

  // Reload on every focus so edits made on the profile-edit screen show
  // immediately when the user navigates back to this tab.
  useFocusEffect(
    useCallback(() => {
    let mounted = true;

    const loadProfile = async () => {
      try {
        let patientId = explicitPatientId;

        if (explicitPatientId) {
          setUser({ ...fallbackUser, ...seedUser, id: explicitPatientId });
        } else {
          const stored = await getStoredUser();
          if (stored && mounted) setUser({ ...fallbackUser, ...stored });

          const meRes = await getMe();
          const authUser = meRes?.success ? meRes.data?.user : stored;
          if (authUser && mounted) setUser({ ...fallbackUser, ...authUser });
          patientId = authUser?.id;
        }

        if (patientId) {
          try {
            const gameHistory = await getPatientGameSessions(patientId);
            if (mounted) setGameSessions(gameHistory);
          } catch {
            if (mounted) setGameSessions([]);
          }
        }

        if (!explicitPatientId) {
          const activeSession = await loadActiveSession();
          if (activeSession?.status === "done" && mounted) {
            setLatestSession(activeSession);
            return;
          }
        }

        if (patientId) {
          const assessmentHistory = await getPatientAssessmentHistory(patientId);
          const latestDone = assessmentHistory.find(
            (session) => session.status === "done",
          );
          if (latestDone && mounted) setLatestSession(latestDone);
        }
      } catch {
        // Keep the profile usable with local placeholders if the API is offline.
      } finally {
        if (mounted) setLoadingScreening(false);
      }
    };

    loadProfile();
    return () => {
      mounted = false;
    };
    }, [explicitPatientId]),
  );

  const screeningRows = useMemo<ScreeningRow[]>(() => {
    if (!latestSession?.sectionScores) return [];

    return Object.entries(latestSession.sectionScores).map(
      ([section, score]) => {
        const max = SECTION_MAX[section as keyof MMSESession["sectionScores"]];
        return {
          section,
          score,
          max,
          percent: Math.round((score / max) * 100),
        };
      },
    );
  }, [latestSession]);

  const gameReviews = useMemo<Review[]>(() => {
    return GAME_ORDER.map((gameId) => {
      const sessions = gameSessions.filter((session) => session.gameId === gameId);
      if (!sessions.length) return null;

      const bestScore = sessions.reduce(
        (best, session) => Math.max(best, getScorePercent(session)),
        0,
      );
      const averageScore =
        sessions.reduce((total, session) => total + getScorePercent(session), 0) /
        sessions.length;

      // sessions[0] is the most recent play.
      const percents = sessions.map(getScorePercent);
      const half = Math.ceil(percents.length / 2);
      const avg = (values: number[]) =>
        values.reduce((total, value) => total + value, 0) / values.length;
      const trend =
        percents.length > 1
          ? Math.round(avg(percents.slice(0, half)) - avg(percents.slice(half)))
          : null;

      return {
        gameId: gameId as GameId,
        sessions: sessions.length,
        bestScore: `${bestScore}%`,
        lastPlayed: formatRelativeDate(sessions[0]?.completedAt),
        review: getGameReview(averageScore, sessions.length),
        bestPercent: bestScore,
        averagePercent: Math.round(averageScore),
        recentScores: percents.slice(0, 7).reverse(),
        trend,
      };
    }).filter((review): review is Review => review !== null);
  }, [gameSessions]);

  return {
    user,
    latestSession,
    loadingScreening,
    screeningRows,
    gameReviews,
  };
}
