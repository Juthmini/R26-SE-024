// UNIT TESTS - Rule-based recommendation engine (decides WHAT advice is shown)
import { generateRecommendations, getSummaryMessage } from '../../../src/utils/recommendationEngine';

// A calm, healthy day. Each test changes only the field(s) it is about.
const calmForm = {
  sleepHours: 8, physicalTiredness: 2, mood: 4, emotionalOverwhelm: 2, hoursCaregiving: 4,
  tasksAssigned: 10, tasksCompleted: 10, difficultSituations: 1, breaksTaken: 3,
  mentallyExhausted: 2, difficultyManaging: 2, emotionallyDrained: 2,
};
const mk = (stressLevel: 'Low' | 'Moderate' | 'High' = 'Moderate', stressScore = 5) =>
  ({ stressLevel, stressScore, confidence: 0.9, message: '', tips: [], submittedAt: '' });
const weeklyBase = { riskScore: 20, riskLevel: 'Low' as const, trend: 'stable' as const, forecast: '', factors: [], daysAnalyzed: 5 };
const ids = (recs: any[]) => recs.map((r) => r.id);

describe('Individual rules (today\'s form)', () => {
  test('UT-FE-01 calm day, moderate stress -> no advice cards', () => {
    expect(generateRecommendations(calmForm, mk('Moderate'))).toEqual([]);
  });

  test('UT-FE-02 sleep under 6h -> sleep card, High priority', () => {
    const r = generateRecommendations({ ...calmForm, sleepHours: 5 }, mk());
    expect(ids(r)).toContain('sleep');
    expect(r.find((x) => x.id === 'sleep')!.priority).toBe('High');
  });

  test('UT-FE-03 sleep of exactly 6h -> NO sleep card (boundary)', () => {
    expect(ids(generateRecommendations({ ...calmForm, sleepHours: 6 }, mk()))).not.toContain('sleep');
  });

  test('UT-FE-04 critical sleep (<=4h) uses the "Severe" title and 8-9 hour advice', () => {
    const rec = generateRecommendations({ ...calmForm, sleepHours: 3 }, mk()).find((x) => x.id === 'sleep')!;
    expect(rec.title).toMatch(/Severe/);
    expect(rec.recommendations[0]).toMatch(/8–9/);
  });

  test('UT-FE-05 emotional overwhelm >= 4 -> emotional card', () => {
    expect(ids(generateRecommendations({ ...calmForm, emotionalOverwhelm: 4 }, mk()))).toContain('emotional');
  });

  test('UT-FE-06 more than 10 pending tasks -> workload-high only', () => {
    const r = ids(generateRecommendations({ ...calmForm, tasksAssigned: 20, tasksCompleted: 5 }, mk()));
    expect(r).toContain('workload-high');
    expect(r).not.toContain('workload-moderate');
  });

  test('UT-FE-07 6-10 pending tasks -> workload-moderate only', () => {
    const r = ids(generateRecommendations({ ...calmForm, tasksAssigned: 16, tasksCompleted: 8 }, mk()));
    expect(r).toContain('workload-moderate');
    expect(r).not.toContain('workload-high');
  });

  test('UT-FE-08 zero breaks -> no-breaks card', () => {
    expect(ids(generateRecommendations({ ...calmForm, breaksTaken: 0 }, mk()))).toContain('no-breaks');
  });

  test('UT-FE-09 one break after 6+ caregiving hours -> few-breaks card', () => {
    expect(ids(generateRecommendations({ ...calmForm, breaksTaken: 1, hoursCaregiving: 7 }, mk()))).toContain('few-breaks');
  });

  test('UT-FE-10 low mood (<=2) -> mood card; mood 1 is High priority', () => {
    const rec = generateRecommendations({ ...calmForm, mood: 1 }, mk()).find((x) => x.id === 'mood')!;
    expect(rec).toBeDefined();
    expect(rec.priority).toBe('High');
  });

  test('UT-FE-11 physical tiredness >= 4 -> physical card', () => {
    expect(ids(generateRecommendations({ ...calmForm, physicalTiredness: 4 }, mk()))).toContain('physical');
  });

  test('UT-FE-12 4+ difficult situations -> difficult card', () => {
    expect(ids(generateRecommendations({ ...calmForm, difficultSituations: 4 }, mk()))).toContain('difficult');
  });

  test('UT-FE-13 High stress + very high emotional load -> counselling card', () => {
    const f = { ...calmForm, emotionalOverwhelm: 5, mentallyExhausted: 5, emotionallyDrained: 5 };
    expect(ids(generateRecommendations(f, mk('High', 9)))).toContain('counselling');
  });

  test('UT-FE-14 Moderate stress never triggers counselling even with high emotions', () => {
    const f = { ...calmForm, emotionalOverwhelm: 5, mentallyExhausted: 5, emotionallyDrained: 5 };
    expect(ids(generateRecommendations(f, mk('Moderate')))).not.toContain('counselling');
  });

  test('UT-FE-15 family-support card needs non-Low stress AND more than 5 pending tasks', () => {
    const busy = { ...calmForm, tasksAssigned: 16, tasksCompleted: 8 };
    expect(ids(generateRecommendations(busy, mk('Moderate')))).toContain('family');
    expect(ids(generateRecommendations(busy, mk('Low')))).not.toContain('family');
  });

  test('UT-FE-16 5+ caregiving hours -> hydration card', () => {
    expect(ids(generateRecommendations({ ...calmForm, hoursCaregiving: 5 }, mk()))).toContain('hydration');
  });

  test('UT-FE-17 ML says High but no single cause -> overall-high card', () => {
    expect(ids(generateRecommendations(calmForm, mk('High', 8)))).toContain('overall-high');
  });

  test('UT-FE-18 Low stress today -> positive "today-low" card', () => {
    expect(ids(generateRecommendations(calmForm, mk('Low', 1.5)))).toContain('today-low');
  });
});

describe('Weekly trend rules', () => {
  test('UT-FE-19 2+ consecutive High days -> sustained-stress card', () => {
    const w = { ...weeklyBase, consecutiveHigh: 3, riskLevel: 'High' as const };
    expect(ids(generateRecommendations(calmForm, mk(), [], [], w))).toContain('sustained-stress');
  });

  test('UT-FE-20 worsening trend (3+ days, <2 high days) -> trend-worsening card', () => {
    const w = { ...weeklyBase, trend: 'worsening' as const, consecutiveHigh: 0 };
    expect(ids(generateRecommendations(calmForm, mk(), [], [], w))).toContain('trend-worsening');
  });

  test('UT-FE-21 worsening trend with <3 days of data -> no trend card', () => {
    const w = { ...weeklyBase, trend: 'worsening' as const, daysAnalyzed: 2 };
    expect(ids(generateRecommendations(calmForm, mk(), [], [], w))).not.toContain('trend-worsening');
  });

  test('UT-FE-22 weekly average sleep <6 but good sleep today -> chronic-sleep card', () => {
    const w = { ...weeklyBase, avgSleep: 5 };
    expect(ids(generateRecommendations({ ...calmForm, sleepHours: 8 }, mk(), [], [], w))).toContain('chronic-sleep');
  });

  test('UT-FE-23 improving trend -> positive trend-improving card', () => {
    const w = { ...weeklyBase, trend: 'improving' as const };
    expect(ids(generateRecommendations(calmForm, mk(), [], [], w))).toContain('trend-improving');
  });

  test('UT-FE-24 works without any weekly data (undefined is safe)', () => {
    expect(() => generateRecommendations({ ...calmForm, sleepHours: 4 }, mk(), [], [], undefined)).not.toThrow();
  });
});

describe('Priority, ordering, limits and feedback', () => {
  test('UT-FE-25 today High stress escalates Medium cards to High', () => {
    const f = { ...calmForm, physicalTiredness: 4 }; // normally Medium
    const normal = generateRecommendations(f, mk('Moderate')).find((x) => x.id === 'physical')!;
    const escalated = generateRecommendations(f, mk('High', 8)).find((x) => x.id === 'physical')!;
    expect(normal.priority).toBe('Medium');
    expect(escalated.priority).toBe('High');
  });

  test('UT-FE-26 weekly High burnout also escalates Medium cards to High', () => {
    const f = { ...calmForm, physicalTiredness: 4 };
    const w = { ...weeklyBase, riskLevel: 'High' as const };
    expect(generateRecommendations(f, mk('Moderate'), [], [], w).find((x) => x.id === 'physical')!.priority).toBe('High');
  });

  test('UT-FE-27 cards are sorted High -> Medium -> Low', () => {
    const f = { ...calmForm, sleepHours: 4, physicalTiredness: 4, hoursCaregiving: 5 };
    const order = { High: 0, Medium: 1, Low: 2 };
    const p = generateRecommendations(f, mk()).map((x) => order[x.priority]);
    expect([...p].sort()).toEqual(p);
  });

  test('UT-FE-28 never returns more than 7 cards', () => {
    const worst = { sleepHours: 2, physicalTiredness: 5, mood: 1, emotionalOverwhelm: 5, hoursCaregiving: 14,
      tasksAssigned: 20, tasksCompleted: 2, difficultSituations: 5, breaksTaken: 0, mentallyExhausted: 5, difficultyManaging: 5, emotionallyDrained: 5 };
    expect(generateRecommendations(worst, mk('High', 9.5)).length).toBeLessThanOrEqual(7);
  });

  test('UT-FE-29 "suppressed" cards (marked not helpful) are removed', () => {
    const r = generateRecommendations({ ...calmForm, sleepHours: 4 }, mk(), ['sleep']);
    expect(ids(r)).not.toContain('sleep');
  });

  test('UT-FE-30 "boosted" cards (marked helpful) move to the front', () => {
    const f = { ...calmForm, sleepHours: 4, hoursCaregiving: 5 }; // sleep (High) + hydration (Low)
    const r = generateRecommendations(f, mk(), [], ['hydration']);
    expect(r[0].id).toBe('hydration');
  });

  test('UT-FE-31 every card has the fields the screen needs', () => {
    const r = generateRecommendations({ ...calmForm, sleepHours: 4 }, mk());
    r.forEach((c) => {
      expect(c.id && c.title && c.primaryCause && c.reason && c.expectedBenefit).toBeTruthy();
      expect(c.recommendations.length).toBeGreaterThan(0);
    });
  });
});

describe('getSummaryMessage', () => {
  test('UT-FE-32 High stress message shows completion % and difficult situations', () => {
    const m = getSummaryMessage({ ...calmForm, tasksAssigned: 10, tasksCompleted: 5, difficultSituations: 3 }, mk('High'));
    expect(m).toMatch(/50%/);
    expect(m).toMatch(/3 difficult situations/);
  });

  test('UT-FE-33 Moderate message mentions breaks taken', () => {
    expect(getSummaryMessage({ ...calmForm, breaksTaken: 1 }, mk('Moderate'))).toMatch(/1 break taken/);
  });

  test('UT-FE-34 Low message is the positive one', () => {
    expect(getSummaryMessage(calmForm, mk('Low'))).toMatch(/Excellent work/);
  });

  test('UT-FE-35 zero assigned tasks does not divide by zero', () => {
    const m = getSummaryMessage({ ...calmForm, tasksAssigned: 0, tasksCompleted: 0 }, mk('Low'));
    expect(m).not.toMatch(/NaN|Infinity/);
  });
});
