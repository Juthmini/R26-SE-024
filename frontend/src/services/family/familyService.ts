// ──────────────────────────────────────────────────────────────────────────────
//  Family Service — real patient-link resolution
// ──────────────────────────────────────────────────────────────────────────────

import { authFetch } from '../../api/authApi';
import { LinkedPatient } from '../../types/family.types';

// resolves the real patient the logged-in family account is linked to
// (set at registration via the patient's email — see auth/register/family.tsx).
// Mood fields (currentMood/moodEmoji/lastUpdated/moodHistory) are honest
// neutral/no-data defaults here, since this call has no session data to
// work with — screens that have real session reports fetched (index.tsx,
// patient.tsx) override them via src/utils/moodMapping.ts.
export const getLinkedPatient = async (): Promise<LinkedPatient | null> => {
  const res = await authFetch('/family/link/me');
  if (!res.success) return null;
  const p = res.patient;
  return {
    id: p._id,
    name: p.name,
    initials: p.initials,
    avatarColor: p.avatarColor,
    age: p.age,
    condition: p.condition,
    stage: p.stage,
    currentMood: 'neutral',
    moodEmoji: '😐',
    lastUpdated: 'No sessions yet',
    moodHistory: ['neutral', 'neutral', 'neutral', 'neutral', 'neutral', 'neutral', 'neutral'],
    routines: (p.routines || []).map((r: any) => ({
      title: r.title,
      time: r.time,
      completed: !!r.completed,
    })),
  };
};
