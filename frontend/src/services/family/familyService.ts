// ──────────────────────────────────────────────────────────────────────────────
//  Family Service – Mock Data (replace with real API calls later)
// ──────────────────────────────────────────────────────────────────────────────

import { authFetch } from '../../api/authApi';
import {
  CareUpdate,
  FamilyMessage,
  LinkedPatient,
} from '../../types/family.types';

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

export const getRecentUpdates = (): CareUpdate[] => [
  {
    id: 'u-001',
    title: 'Morning Medication Given',
    description: 'All morning medications administered on time.',
    icon: 'medical',
    severity: 'positive',
    caregiverName: 'Nurse Sarah',
    time: '9:00 AM',
  },
  {
    id: 'u-002',
    title: 'Mood Lift Detected',
    description: 'Happy emotion jumped to 71% after story playback.',
    icon: 'happy',
    severity: 'positive',
    caregiverName: 'AI System',
    time: '10:32 AM',
  },
  {
    id: 'u-003',
    title: 'Lunch Assistance Needed',
    description: 'Patient needed extra help with lunch today.',
    icon: 'restaurant',
    severity: 'info',
    caregiverName: 'Nurse Sarah',
    time: '12:15 PM',
  },
  {
    id: 'u-004',
    title: 'Hydration Reminder',
    description: 'Patient has not had water in the last 2 hours.',
    icon: 'water',
    severity: 'warning',
    caregiverName: 'AI System',
    time: '2:00 PM',
  },
];

export const getMessages = (): FamilyMessage[] => [
  {
    id: 'm-001',
    senderId: 'caregiver',
    senderName: 'Nurse Sarah',
    text: 'Good morning! Shan had a lovely breakfast and is in great spirits today 😊',
    timestamp: '8:45 AM',
    isRead: true,
  },
  {
    id: 'm-002',
    senderId: 'family',
    senderName: 'You',
    text: 'Thank you Sarah! I played the wedding story last night, she seemed to enjoy it.',
    timestamp: '9:10 AM',
    isRead: true,
  },
  {
    id: 'm-003',
    senderId: 'caregiver',
    senderName: 'Nurse Sarah',
    text: 'The system picked it up! Her mood score jumped 34% during playback. You should call her soon!',
    timestamp: '10:35 AM',
    isRead: false,
  },
];
