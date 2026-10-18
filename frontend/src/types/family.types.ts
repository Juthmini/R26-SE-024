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

export interface PatientRoutine {
  title: string;
  time: string;
  completed: boolean;
}

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
  routines: PatientRoutine[];
}

// ── Dashboard Stats ───────────────────────────────────────────────────────────
export interface FamilyDashboardStats {
  moodScore: number;        // 0-100, real — latest session's happyAfterPercent
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

// ── Quick Actions ─────────────────────────────────────────────────────────────
export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  route?: string;
}

// ── Family Calendar Moment Cards ──────────────────────────────────────────────
export type EventType = 'birthday' | 'anniversary' | 'festival' | 'religious' | 'other';
export type EventStatus = 'scheduled' | 'shown' | 'completed' | 'snoozed' | 'missed';
export type ReactionType = 'emoji' | 'voice' | 'video' | 'skipped';
export type EmojiReaction = 'happy' | 'calm' | 'sad';

export interface FamilyEvent {
  id: string;
  title: string;
  eventType: EventType;
  personName: string;
  relation: string;
  eventDate: string;       // ISO date string
  eventTime: string;       // stored 24-hour "HH:mm"
  scheduledAt: string | null; // real combined date+time instant; null for pre-existing events saved before this existed
  note: string;            // max 200 chars
  photoUrl: string;
  sensitive: boolean;      // calm theme, no voice-wish prompt, when true
  cardText: string;        // plain-template sentence shown on the Moment Card
  cardTextSource: 'template' | 'ai'; // 'ai' only when the opt-in AI call actually succeeded
  theme: string;           // 'calm' when sensitive, else mirrors eventType
  status: EventStatus;
  createdAt: string;
}

export interface EventReaction {
  id: string;
  event: string;           // FamilyEvent id
  type: ReactionType;
  emoji: EmojiReaction | null;
  mediaUrl: string;        // voice/video clip URL, when present
  durationSeconds: number;
  seenByFamilyAt: string | null;
  createdAt: string;
}
