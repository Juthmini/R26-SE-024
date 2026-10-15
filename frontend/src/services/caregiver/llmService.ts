// frontend/src/services/caregiver/llmService.ts
import { authFetch } from '@/src/api/authApi';
import { BurnoutRisk } from '../../types/caregiver.types';
import { SmartRecommendation } from '../../utils/recommendationEngine';

export interface PersonalizedCoach {
  message: string;
  notes: Record<string, string>;
}

export const fetchPersonalizedCoach = async (
  stressLevel: string,
  stressScore: number,
  weekly: BurnoutRisk | undefined,
  recs: SmartRecommendation[],
): Promise<PersonalizedCoach | null> => {
  try {
    const data = await authFetch('/caregiver/ai-coach/personalize', {
      method: 'POST',
      body: JSON.stringify({
        stressLevel,
        stressScore,
        weekly,
        recs: recs.map((r) => ({
          id: r.id, title: r.title, primaryCause: r.primaryCause,
          recommendations: r.recommendations,
        })),
      }),
    });
    return data?.success ? data.personalized ?? null : null;
  } catch {
    return null;
  }
};