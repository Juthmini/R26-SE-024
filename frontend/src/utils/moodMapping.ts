// Single source of truth for turning real session/emotion data into the
// dashboard's 5-bucket mood scale — used by both app/family/index.tsx
// (PatientStatusCard) and app/family/patient.tsx (7-day mood strip), so the
// two screens always agree instead of each showing a different hardcoded
// guess.
import { MemorySessionReport } from '../services/family/emotionService';
import { PatientMood } from '../types/family.types';

const POSITIVE_EMOTIONS = new Set(['happy']);
const NEGATIVE_EMOTIONS = new Set(['sad', 'angry', 'fear', 'disgust']);
// everything else (neutral, surprise) falls through to 'neutral'

export const MOOD_EMOJI: Record<PatientMood, string> = {
  awful: '😞',
  sad: '😔',
  neutral: '😐',
  happy: '😊',
  great: '😄',
};

// emotion = a classifier label (happy/sad/angry/surprise/fear/disgust/neutral),
// intensityPercent = how confident that reading was (0-100), used only to
// decide between the "mild" and "strong" bucket on each side
export function emotionToMoodBucket(
  emotion: string | null | undefined,
  intensityPercent?: number
): PatientMood {
  if (!emotion) return 'neutral';
  if (POSITIVE_EMOTIONS.has(emotion)) {
    return (intensityPercent ?? 0) >= 80 ? 'great' : 'happy';
  }
  if (NEGATIVE_EMOTIONS.has(emotion)) {
    return (intensityPercent ?? 0) >= 80 ? 'awful' : 'sad';
  }
  return 'neutral';
}

// builds a 7-length array, oldest to newest (index 6 = today), one bucket
// per calendar day using that day's most recent session — days with no
// recorded session get an honest 'neutral' no-data bucket rather than a
// fabricated guess
export function buildWeeklyMoodHistory(reports: MemorySessionReport[]): PatientMood[] {
  const days: PatientMood[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(today);
    dayStart.setDate(dayStart.getDate() - i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const sameDayReports = reports
      .filter((r) => {
        const t = new Date(r.rawCreatedAt).getTime();
        return t >= dayStart.getTime() && t < dayEnd.getTime();
      })
      .sort((a, b) => new Date(b.rawCreatedAt).getTime() - new Date(a.rawCreatedAt).getTime());

    const latest = sameDayReports[0];
    days.push(latest ? emotionToMoodBucket(latest.finalEmotion, latest.happyAfterPercent) : 'neutral');
  }

  return days;
}
