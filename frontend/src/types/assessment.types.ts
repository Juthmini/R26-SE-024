export type QuestionType =
  | 'mcq'
  | 'text_input'
  | 'word_recall_display'
  | 'word_recall_input'
  | 'serial_subtraction'
  | 'drawing_canvas'
  | 'instruction_action'  
  | 'phrase_repeat'
  | 'image_mcq';  

export type SectionName =
  | 'Orientation'
  | 'Registration'
  | 'Attention'
  | 'Recall'
  | 'Language';

export interface MCQOption {
  id: string;
  label: string;
}

export interface Question {
  id: string;
  section: SectionName;
  type: QuestionType;
  prompt: string;
  subPrompt?: string;           // instruction text below main prompt
  options?: MCQOption[];        // for mcq type
  image? : string,
  imageDescription?: string,
  expectedAnswers?: string[];   // for text_input, serial_subtraction
  words?: string[];             // for word_recall_display
  timeLimit?: number;           // seconds - null means no timer
  maxScore: number;
  maxAttempts?: number;         // registration allows up to 5 repeats
  referenceAsset?: string;      // image path for drawing question
  instructionSteps?: string[];  // for instruction_action (3-step paper fold)
  phrase?: string;  // for phrase_repeat
  audioAsset?: string;          // phrase_repeat: bundled clip; absent -> read `phrase` aloud
  emoji?: string;               // image_mcq: on-device picture when there is no `image` URL
  variantKey?: string;          // which rotated variant this session got
  criteria?: string[];          // drawing_canvas: caregiver checklist for this figure
  figureName?: string;          // drawing_canvas: what the figure is (results screen)
  questionId?: string;          // backend id (normalized into `id`)
}

export type SessionStatus = 'idle' | 'active' | 'done' | 'abandoned';
export type AttentionMethod = 'serial7' | 'world';
export type Severity = 'none' | 'mild' | 'moderate' | 'severe';

export interface SectionScores {
  Orientation: number;
  Registration: number;
  Attention: number;
  Recall: number;
  Language: number;
}

export interface ScoringLogEntry {
  questionId: string;
  earned: number;
  max: number;
}

export interface MMSESession {
  // Navigation
  currentQuestionIndex: number;
  totalQuestions: number;
  status: SessionStatus;

  // Answers
  answers: Record<string, any>;
  answeredAt: Record<string, number>;
  timePerQuestion: Record<string, number>;
  attemptCount: Record<string, number>;
  skipped: string[];
  registrationWords: string[];
  questionSet?: Question[];     // v2+: the rotated questions this session was given

  // Scoring
  sectionScores: SectionScores;
  totalScore: number;
  attentionMethod: AttentionMethod;
  adjustedScore: number | null;
  impairmentFlag: boolean;
  severity: Severity;
  scoringLog: ScoringLogEntry[];

  // Special MMSE flags
  serial7Attempted: boolean;
  worldSpellingFallback: boolean;
  recallWordsShown: boolean;

  // Timer
  questionStartTime: number;
  timeLimit: number | null;
  timeExpired: boolean;

  // Metadata
  sessionId: string;
  patientId: string;
  caregiverId: string;
  startedAt: string;
  completedAt: string | null;
  locale: string;
  administrationMode: 'assisted' | 'self';
}

