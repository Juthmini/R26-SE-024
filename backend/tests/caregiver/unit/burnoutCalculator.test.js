// UNIT TESTS - Burnout calculator (pure maths, no database needed)
const { calculateBurnoutRisk } = require('../../../src/utils/burnoutCalculator');

// Helpers that build a fake check-in
const badDay = (date) => ({
  checkInDate: date, stressScore: 8, stressLevel: 'High', sleepHours: 4, breaksTaken: 0,
  emotionalOverwhelm: 5, emotionallyDrained: 5, mentallyExhausted: 5,
  tasksCompleted: 5, tasksAssigned: 15,
});
const goodDay = (date) => ({
  checkInDate: date, stressScore: 2, stressLevel: 'Low', sleepHours: 8, breaksTaken: 3,
  emotionalOverwhelm: 1, emotionallyDrained: 1, mentallyExhausted: 1,
  tasksCompleted: 10, tasksAssigned: 10,
});

describe('Burnout calculator calculateBurnoutRisk', () => {

  test('UT-BE-01 returns the zero-state when there are no check-ins', () => {
    const r = calculateBurnoutRisk([]);
    expect(r.riskScore).toBe(0);
    expect(r.riskLevel).toBe('Low');
    expect(r.daysAnalyzed).toBe(0);
    expect(r.factors).toEqual([]);
    expect(r.forecast).toMatch(/Complete at least 3 check-ins/);
  });

  test('UT-BE-02 handles null input safely (no crash)', () => {
    expect(calculateBurnoutRisk(null).riskLevel).toBe('Low');
  });

  test('UT-BE-03 flags High risk with 5 factors after 3 consecutive bad days', () => {
    const r = calculateBurnoutRisk([badDay('2026-01-01'), badDay('2026-01-02'), badDay('2026-01-03')]);
    expect(r.riskScore).toBe(81);
    expect(r.riskLevel).toBe('High');
    expect(r.consecutiveHigh).toBe(3);
    expect(r.avgSleep).toBe(4);
    expect(r.daysAnalyzed).toBe(3);
    const names = r.factors.map((f) => f.factor);
    expect(names).toEqual(expect.arrayContaining([
      'Consecutive high stress days', 'Sleep deprivation', 'High emotional burden',
      'Insufficient breaks', 'Task overload',
    ]));
    expect(r.factors).toHaveLength(5);
  });

  test('UT-BE-04 flags Low risk with no factors after 3 good days', () => {
    const r = calculateBurnoutRisk([goodDay('2026-01-01'), goodDay('2026-01-02'), goodDay('2026-01-03')]);
    expect(r.riskScore).toBe(2);
    expect(r.riskLevel).toBe('Low');
    expect(r.factors).toEqual([]);
    expect(r.forecast).toMatch(/managing your wellbeing well/);
  });

  test('UT-BE-05 the "consecutive high" streak resets when a non-High day appears', () => {
    const r = calculateBurnoutRisk([badDay('2026-01-01'), goodDay('2026-01-02'), badDay('2026-01-03')]);
    expect(r.consecutiveHigh).toBe(1);
  });

  test('UT-BE-06 detects a worsening trend (good days then bad days)', () => {
    const r = calculateBurnoutRisk([
      goodDay('2026-01-01'), goodDay('2026-01-02'), goodDay('2026-01-03'),
      badDay('2026-01-04'), badDay('2026-01-05'),
    ]);
    expect(r.trend).toBe('worsening');
  });

  test('UT-BE-07 detects an improving trend (bad days then good days)', () => {
    const r = calculateBurnoutRisk([
      badDay('2026-01-01'), badDay('2026-01-02'), badDay('2026-01-03'),
      goodDay('2026-01-04'), goodDay('2026-01-05'),
    ]);
    expect(r.trend).toBe('improving');
  });

  test('UT-BE-08 sorts check-ins by date, so input order does not matter', () => {
    const r = calculateBurnoutRisk([badDay('2026-01-03'), badDay('2026-01-01'), badDay('2026-01-02')]);
    expect(r.consecutiveHigh).toBe(3);
  });

  test('UT-BE-09 fewer than 3 days gives a "complete more check-ins" forecast', () => {
    const r = calculateBurnoutRisk([goodDay('2026-01-01')]);
    expect(r.daysAnalyzed).toBe(1);
    expect(r.forecast).toMatch(/Complete 2 more check-in/);
  });

  test('UT-BE-10 risk score always stays between 0 and 100', () => {
    const worst = calculateBurnoutRisk(Array.from({ length: 7 }, (_, i) => badDay(`2026-01-0${i + 1}`)));
    const best = calculateBurnoutRisk(Array.from({ length: 7 }, (_, i) => goodDay(`2026-01-0${i + 1}`)));
    expect(worst.riskScore).toBeLessThanOrEqual(100);
    expect(best.riskScore).toBeGreaterThanOrEqual(0);
  });
});
