import axios from 'axios';
import { EngagementAlert } from '../../types/family.types';

const API_URL = `${process.env.EXPO_PUBLIC_API_URL}/api`;

const timeAgo = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.round(diffMs / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return `${hours} hr ago`;
};

// shared mapper — turns one raw SessionOutcome into the shape the
// Predictive Engagement UI (dashboard card + alerts screen) expects
const mapOutcomeToAlert = (outcome: any, patientName: string): EngagementAlert => {
  const shift = outcome.moodShiftPercent ?? 0;
  const storyTitle = outcome.memoryId?.familyNote || 'a memory story';

  const message = shift >= 15
    ? `Her mood is up ${shift}%. Call her now while she's still in that warm memory.`
    : shift > 0
      ? `Her mood lifted a little (+${shift}%) during this story.`
      : `Her mood didn't shift much this time — worth checking in on her.`;

  return {
    id: outcome._id,
    stage: 4,
    patientName,
    storyTitle,
    message,
    moodShift: shift,
    sadBefore: outcome.sadBeforePercent ?? 0,
    sadAfter: 100 - (outcome.happyAfterPercent ?? 0),
    happyAfter: outcome.happyAfterPercent ?? 0,
    triggeredAt: timeAgo(outcome.createdAt),
    isActive: !!outcome.alertTriggered && !outcome.acknowledged,
    acknowledged: !!outcome.acknowledged,
    actedAt: outcome.actedAt || null,
    followUpOutcome: outcome.followUpOutcome || null,
  };
};

// fetches the most recent story-listening session's mood outcome for a
// patient and maps it into the shape the Predictive Engagement card
// expects. Always the LATEST session — a new one naturally replaces
// whatever was shown before, since outcomes are sorted newest-first.
// isActive only turns on when that session actually crossed the mood-lift
// threshold (alertTriggered) and hasn't already been acknowledged.
export const getLatestEngagementAlert = async (
  patientId: string,
  patientName: string
): Promise<EngagementAlert | null> => {
  try {
    const response = await axios.get(`${API_URL}/family/emotion/outcomes/${patientId}`);
    const outcomes = response.data?.outcomes || [];
    if (outcomes.length === 0) return null;

    return mapOutcomeToAlert(outcomes[0], patientName);
  } catch (error: any) {
    console.error('Fetch engagement alert error:', error.message);
    return null;
  }
};

// fetches every session that actually crossed the mood-lift alert
// threshold — the full history for the Alerts screen, not just the latest
export const getEngagementAlerts = async (
  patientId: string,
  patientName: string
): Promise<EngagementAlert[]> => {
  try {
    const response = await axios.get(`${API_URL}/family/emotion/outcomes/${patientId}`);
    const outcomes = response.data?.outcomes || [];
    return outcomes
      .filter((o: any) => o.alertTriggered)
      .map((o: any) => mapOutcomeToAlert(o, patientName));
  } catch (error: any) {
    console.error('Fetch engagement alerts error:', error.message);
    return [];
  }
};

// marks an alert as handled so it stops showing as the active card
export const acknowledgeAlert = async (outcomeId: string): Promise<boolean> => {
  try {
    const response = await axios.patch(`${API_URL}/family/emotion/outcomes/${outcomeId}/acknowledge`);
    return !!response.data?.success;
  } catch (error: any) {
    console.error('Acknowledge alert error:', error.message);
    return false;
  }
};

// records that the family member tapped "Call Now" on an alert — also
// acknowledges it server-side, so the same card doesn't linger afterward
export const recordAction = async (outcomeId: string): Promise<boolean> => {
  try {
    const response = await axios.patch(`${API_URL}/family/emotion/outcomes/${outcomeId}/act`);
    return !!response.data?.success;
  } catch (error: any) {
    console.error('Record action error:', error.message);
    return false;
  }
};

// records how the follow-up call actually went, self-reported by the family
export const recordFollowUp = async (
  outcomeId: string,
  outcome: 'positive' | 'neutral' | 'difficult'
): Promise<boolean> => {
  try {
    const response = await axios.patch(`${API_URL}/family/emotion/outcomes/${outcomeId}/followup`, {
      followUpOutcome: outcome,
    });
    return !!response.data?.success;
  } catch (error: any) {
    console.error('Record follow-up error:', error.message);
    return false;
  }
};

export interface EngagementStats {
  totalAlerts: number;
  actedOn: number;
  responseRate: number;
  avgResponseMinutes: number | null;
  followUpsLogged: number;
  positiveOutcomeRate: number | null;
}

// did families actually act on alerts, and did it help — the real
// evidence behind the "predictive engagement" claim
export const getEngagementStats = async (patientId: string): Promise<EngagementStats | null> => {
  try {
    const response = await axios.get(`${API_URL}/family/emotion/engagement-stats/${patientId}`);
    return response.data?.success ? response.data.stats : null;
  } catch (error: any) {
    console.error('Fetch engagement stats error:', error.message);
    return null;
  }
};

// pings the emotion detection service to wake it from cold-sleep before
// real-time capture starts. Fire-and-forget — caller shouldn't await the
// actual wake-up, just kick it off as early as possible.
export const warmupEmotionService = () => {
  axios.get(`${API_URL}/family/emotion/warmup`).catch(() => {});
};

export const logEmotionReading = async (data: {
  patientId: string;
  memoryId: string;
  sessionId: string;
  secondsIntoPlayback: number;
  photoBase64: string;
}) => {
  try {
    const response = await axios.post(
      `${API_URL}/family/emotion/capture`,
      data,
      { timeout: 90000 }
    );
    return response.data;
  } catch (error: any) {
    console.error('Emotion capture error:', error.message);
    return { success: false };
  }
};

export const finalizeEmotionSession = async (sessionId: string) => {
  try {
    const response = await axios.post(`${API_URL}/family/emotion/finalize`, {
      sessionId,
    });
    return response.data;
  } catch (error: any) {
    console.error('Finalize session error:', error.message);
    return { success: false };
  }
};

export const generateSessionId = () => {
  return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

export interface MemorySessionReport {
  id: string;
  storyTitle: string;
  photoUrl: string;
  date: string;
  triggeredAt: string;
  baselineEmotion: string;
  peakEmotion: string;
  finalEmotion: string;
  mostFrequentEmotion: string | null;
  moodShiftPercent: number;
  totalReadings: number;
  category: string;
}

const formatReportDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// fetches every recorded memory-listening session for a patient — the raw
// material for a caregiver-facing report, oldest info first is not needed
// here since the backend already sorts newest-first
export const getMemorySessionReports = async (patientId: string): Promise<MemorySessionReport[]> => {
  try {
    const response = await axios.get(`${API_URL}/family/emotion/outcomes/${patientId}`);
    const outcomes = response.data?.outcomes || [];
    return outcomes.map((o: any) => ({
      id: o._id,
      storyTitle: o.memoryId?.familyNote || 'A memory story',
      photoUrl: o.memoryId?.photoUrl || '',
      date: formatReportDate(o.createdAt),
      triggeredAt: timeAgo(o.createdAt),
      baselineEmotion: o.baselineEmotion,
      peakEmotion: o.peakEmotion,
      finalEmotion: o.finalEmotion,
      mostFrequentEmotion: o.mostFrequentEmotion || null,
      moodShiftPercent: o.moodShiftPercent ?? 0,
      totalReadings: o.totalReadings,
      category: o.memoryId?.category || 'other',
    }));
  } catch (error: any) {
    console.error('Fetch memory session reports error:', error.message);
    return [];
  }
};

// plain-text summary suitable for the native Share sheet (SMS/email/WhatsApp
// to a caregiver) — one session, or the full recent history
export const buildShareableReport = (patientName: string, reports: MemorySessionReport[]): string => {
  if (reports.length === 0) {
    return `${patientName}'s Memory Report\nNo memory sessions recorded yet.`;
  }

  const lines = reports.map((r) => {
    const shiftLabel = r.moodShiftPercent > 0 ? `+${r.moodShiftPercent}%` : `${r.moodShiftPercent}%`;
    return `• ${r.date} — "${r.storyTitle}"\n  Mood: ${r.baselineEmotion} → ${r.finalEmotion} (${shiftLabel}), ${r.totalReadings} readings`;
  });

  return `${patientName}'s Memory Report\n\n${lines.join('\n\n')}\n\nSent from MemoCare`;
};