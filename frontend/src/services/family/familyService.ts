// ──────────────────────────────────────────────────────────────────────────────
//  Family Service – Mock Data (replace with real API calls later)
// ──────────────────────────────────────────────────────────────────────────────

import {
  CareUpdate,
  EngagementAlert,
  FamilyDashboardStats,
  FamilyMessage,
  LinkedPatient,
  MemoryStory,
  SessionFeedback,
} from '../../types/family.types';

export const getLinkedPatient = (): LinkedPatient => ({
  id: '6a8eb91cb3e48b7f1a6ccc06',   // real MongoDB ObjectId — matches seeded Patient
                                     // (also seeded into PatientRegistry with
                                     // the same id, login code PAT-2026-SHAN)
  name: 'Shan',
  initials: 'S',
  avatarColor: '#4F8EF7',
  age: 74,
  condition: 'Moderate',
  stage: 'Early-Mid Stage',
  currentMood: 'happy',
  moodEmoji: '😊',
  lastUpdated: '12 min ago',
  moodHistory: ['neutral', 'sad', 'happy', 'great', 'happy', 'neutral', 'happy'],
});

export const getDashboardStats = (): FamilyDashboardStats => ({
  reminders: 3,
  pendingMedications: 2,
  moodScore: 71,
  activeAlerts: 1,
});

export const getActiveEngagementAlert = (): EngagementAlert => ({
  id: 'ea-001',
  stage: 3,
  patientName: 'Shan',
  storyTitle: 'The Wedding at Clifton House',
  message: 'The wedding story made her smile. Her mood is up 34%. Call her now while she\'s still in that warm memory.',
  moodShift: 34,
  sadBefore: 28,
  sadAfter: 8,
  happyAfter: 71,
  triggeredAt: '2 min ago',
  isActive: true,
});

export const getMemoryStories = (): MemoryStory[] => [
  {
    id: 's-001',
    title: 'The Wedding at Clifton House',
    description: 'Sarah & Tom\'s wedding day, June 1978',
    duration: '1:24',
    createdAt: 'Today',
    status: 'ready',
    voiceName: 'Family Voice',
    moodImpact: 34,
  },
  {
    id: 's-002',
    title: 'Summer at the Lake',
    description: 'Holiday photos, August 1985',
    duration: '0:58',
    createdAt: 'Yesterday',
    status: 'ready',
    voiceName: 'Family Voice',
    moodImpact: 22,
  },
  {
    id: 's-003',
    title: 'Christmas Morning 1991',
    description: 'Opening presents with the kids',
    duration: '1:10',
    createdAt: '3 days ago',
    status: 'new',
    voiceName: 'Family Voice',
  },
];

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

export const getSessionFeedback = (): SessionFeedback[] => [
  {
    id: 'sf-001',
    date: 'Today',
    storyTitle: 'The Wedding at Clifton House',
    moodBefore: 42,
    moodAfter: 76,
    callDuration: 18,
    positiveExtended: true,
    cognitiveScoreChange: 8,
    insight: 'Wedding memories consistently trigger the strongest positive response. Recommend playing this story before every visit.',
  },
  {
    id: 'sf-002',
    date: 'Yesterday',
    storyTitle: 'Summer at the Lake',
    moodBefore: 55,
    moodAfter: 77,
    callDuration: 12,
    positiveExtended: true,
    cognitiveScoreChange: 5,
    insight: 'Lake holiday stories work well in the afternoon. Morning attempts show weaker response.',
  },
];