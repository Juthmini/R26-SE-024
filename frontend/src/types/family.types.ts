// ──────────────────────────────────────────────────────────────────────────────
//  Family Member Portal – TypeScript Types
// ──────────────────────────────────────────────────────────────────────────────

export interface FamilyMember {
  id: string;
  name: string;
  email: string;
  initials: string;
  avatarColor: string;
  linkedPatientId: string;
}

// ── Patient ───────────────────────────────────────────────────────────────────
export type PatientCondition = 'Mild' | 'Moderate' | 'Severe' | 'Stable' | 'Critical';
export type PatientMood = 'awful' | 'sad' | 'neutral' | 'happy' | 'great';

export interface LinkedPatient {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  age: number;
  condition: PatientCondition;
  stage: string;
  currentMood: PatientMood;
  moodEmoji: string;
  lastUpdated: string;
  moodHistory: PatientMood[]; // last 7 days
}

// ── Dashboard Stats ───────────────────────────────────────────────────────────
export interface FamilyDashboardStats {
  reminders: number;
  pendingMedications: number;
  moodScore: number;        // 0-100
  activeAlerts: number;
}

// ── AI Voice Memory Stories ───────────────────────────────────────────────────
export type StoryStatus = 'ready' | 'generating' | 'new';

export interface MemoryStory {
  id: string;
  title: string;
  description: string;
  duration: string;         // e.g. "1:24"
  photoUrl?: string;
  createdAt: string;
  status: StoryStatus;
  voiceName: string;        // whose voice was used
  moodImpact?: number;      // positive shift % last time played
}

// ── Predictive Engagement Engine ──────────────────────────────────────────────
export type EngagementStage = 1 | 2 | 3 | 4;

export interface EngagementAlert {
  id: string;
  stage: EngagementStage;
  patientName: string;
  storyTitle: string;
  message: string;          // contextual message for the family member
  moodShift: number;        // e.g. 34 (percent increase)
  sadBefore: number;        // e.g. 28
  sadAfter: number;         // e.g. 8
  happyAfter: number;       // e.g. 71
  triggeredAt: string;      // time string
  isActive: boolean;
  acknowledged: boolean;
  actedAt: string | null;
  followUpOutcome: 'positive' | 'neutral' | 'difficult' | null;
}

// ── Feedback & Adaptive Learning ─────────────────────────────────────────────
export interface SessionFeedback {
  id: string;
  date: string;
  storyTitle: string;
  moodBefore: number;
  moodAfter: number;
  callDuration?: number;    // minutes
  positiveExtended: boolean;
  cognitiveScoreChange: number; // delta
  insight: string;          // AI generated text insight
}

// ── Care Updates ─────────────────────────────────────────────────────────────
export type UpdateSeverity = 'info' | 'warning' | 'positive';

export interface CareUpdate {
  id: string;
  title: string;
  description: string;
  icon: string;
  severity: UpdateSeverity;
  caregiverName: string;
  time: string;
}

// ── Messages ─────────────────────────────────────────────────────────────────
export interface FamilyMessage {
  id: string;
  senderId: string;         // 'family' | 'caregiver'
  senderName: string;
  text: string;
  timestamp: string;
  isRead: boolean;
}

// ── Quick Actions ─────────────────────────────────────────────────────────────
export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  route?: string;
}
