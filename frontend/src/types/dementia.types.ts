// Types for the dementia triage model served by backend/ml/dementia/app.py:
//  2-class triage -> /api/cognitive/dementia/predict/:patientId
//  questionnaire  -> /api/cognitive/dementia/faq/:patientId

export type TriageLevel = 'monitor' | 'escalate';

export interface TriagePrediction {
  triage: TriageLevel;
  confidence: number; // 0-1
  probabilities: Record<TriageLevel, number>;
  message: string;
  basedOnAssessment: string;
  basedOnFaq: string;
  submittedAt: string;
}

// ── History items (persisted rows, for the Reporting tab) ──────────────────
export interface TriageHistoryItem {
  _id: string;
  patientId: string;
  basedOnAssessment: string | null;
  basedOnFaq: string | null;
  triage: TriageLevel;
  confidence: number;
  probabilities: Record<TriageLevel, number>;
  message: string;
  createdAt: string;
}

// ── Functional Activities Questionnaire (FAQ) ─────────────────────────────
// 10 items, each 0 (normal) .. 3 (someone else does it for them now).
export const FAQ_ITEMS = [
  'bills',
  'taxes',
  'shopping',
  'games',
  'stove',
  'mealPrep',
  'events',
  'payAttention',
  'remindDates',
  'travel',
] as const;

export type FaqItem = (typeof FAQ_ITEMS)[number];
export type FaqAnswers = Record<FaqItem, number>;

export interface FunctionalAssessment extends FaqAnswers {
  _id: string;
  patientId: string;
  basedOnAssessment: string | null;
  total: number;
  createdAt: string;
}

export interface FaqQuestion {
  key: FaqItem;
  title: string; // 2-3 word headline shown big on the question screen
  emoji: string; // picture that makes the topic recognisable at a glance
  question: string; // one short, plain-English question
  examples: string; // concrete everyday examples, so the topic is unambiguous
  checks: string; // one-line "what this measures", for the caregiver / clinician
}

// Wording drafted for older adults and their carers - short question first,
// examples second. Each item still measures the same ability the NACC FAQ item
// does, so the trained model's inputs are unchanged.
export const FAQ_QUESTIONS: FaqQuestion[] = [
  { key: 'bills',        title: 'Managing money',        emoji: '💵', question: 'How well can they manage their money?',                          examples: 'Paying bills on time, handling cash or a bank card, checking the change is right.',           checks: 'Number sense, following steps' },
  { key: 'taxes',        title: 'Paperwork & letters',   emoji: '📄', question: 'How well can they deal with paperwork?',                        examples: 'Forms, letters from the bank, insurance or government, and keeping documents in order.',     checks: 'Handling complex, multi-step tasks' },
  { key: 'shopping',     title: 'Shopping',              emoji: '🛒', question: 'How well can they shop on their own?',                          examples: 'Buying groceries or household things and paying for them.',                                   checks: 'Independent errands, memory, money' },
  { key: 'games',        title: 'Hobbies & games',       emoji: '🧩', question: 'How well can they enjoy a hobby that needs focus?',              examples: 'Cards, board games, puzzles, gardening, knitting or playing an instrument.',                 checks: 'Sustained attention, skill' },
  { key: 'stove',        title: 'Hot drinks & snacks',   emoji: '☕', question: 'How safely can they make a hot drink or snack?',                 examples: 'Boiling the kettle or using the stove, and remembering to turn it off.',                     checks: 'Simple routine task, safety' },
  { key: 'mealPrep',     title: 'Cooking a meal',        emoji: '🍲', question: 'How well can they cook a full meal?',                           examples: 'Deciding what to make, getting everything together and having it ready on time.',            checks: 'Planning and sequencing' },
  { key: 'events',       title: 'Keeping up with news',  emoji: '📰', question: "How well do they keep up with what's going on?",                 examples: 'News, family updates and local happenings, and remembering them later.',                     checks: 'Taking in and holding new information' },
  { key: 'payAttention', title: 'TV & conversation',     emoji: '📺', question: 'How well can they follow a TV show or a conversation?',          examples: 'Following the story, and being able to talk about it afterwards.',                           checks: 'Attention, understanding, recall' },
  { key: 'remindDates',  title: 'Remembering dates',     emoji: '📅', question: 'How well do they remember important dates?',                     examples: 'Appointments, medicines, birthdays and family occasions, without being reminded.',           checks: 'Prospective memory' },
  { key: 'travel',       title: 'Getting around',        emoji: '🚌', question: 'How well can they get around outside the home on their own?',    examples: 'Driving, walking to familiar places, or taking a bus or taxi, without getting lost.',        checks: 'Navigation, planning, independence' },
];

export interface FaqChoice {
  value: number;
  label: string; // full clinical wording (kept for reports / accessibility)
  title: string; // short button heading
  detail: string; // plain-English explanation under the heading
  emoji: string;
  // Soft, non-alarming palette: selected state uses `accent` + `tint`.
  accent: string;
  tint: string;
}

export const FAQ_CHOICES: FaqChoice[] = [
  { value: 0, label: 'Normal — or never did this, but could if needed', title: 'No problem',        detail: 'Manages fine — or never did this, but could if needed.', emoji: '😊', accent: '#16A34A', tint: '#DCFCE7' },
  { value: 1, label: "Does it alone, but it's harder than before",      title: 'A little harder',   detail: 'Still does it alone, but it is harder than before.',       emoji: '🤔', accent: '#65A30D', tint: '#ECFCCB' },
  { value: 2, label: 'Needs some help',                                 title: 'Needs some help',   detail: 'Can do parts of it, but needs someone to help.',           emoji: '🤝', accent: '#D97706', tint: '#FEF3C7' },
  { value: 3, label: 'Someone else does it for them now',               title: 'Someone else does it', detail: 'They no longer do this themselves.',                    emoji: '🙋', accent: '#E11D48', tint: '#FFE4E6' },
];
