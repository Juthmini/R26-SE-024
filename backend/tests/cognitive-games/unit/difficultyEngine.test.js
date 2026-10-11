// UNIT TESTS - Adaptive difficulty engine (pure functions, no database)
const {
  computeSessionMetrics,
  decideDifficulty,
  WINDOW,
  COOLDOWN,
} = require('../../../src/services/cognitive/games/difficultyEngine');
const { GAME_CONTENT } = require('../../../src/services/cognitive/games/staticGameContent');

// Find a (game, difficulty) that really is timed / untimed so the tests do not
// hard-code content that designers may retune later.
const findLevel = (timed) => {
  for (const [gameId, levels] of Object.entries(GAME_CONTENT)) {
    for (const [difficulty, cfg] of Object.entries(levels)) {
      const limit = cfg.timeLimitSeconds;
      if (timed ? typeof limit === 'number' && limit > 0 : !limit) return { gameId, difficulty, limit };
    }
  }
  throw new Error('no suitable level found in GAME_CONTENT');
};
const TIMED = findLevel(true);
const UNTIMED = findLevel(false);

const session = (o = {}) => ({
  gameId: UNTIMED.gameId,
  difficulty: UNTIMED.difficulty,
  score: 8,
  maxScore: 10,
  correctAnswers: 8,
  totalAnswers: 10,
  timeTaken: 20,
  ...o,
});

describe('computeSessionMetrics', () => {
  test('UT-BE-01 accuracy is score / maxScore as a rounded percentage', () => {
    expect(computeSessionMetrics(session({ score: 7, maxScore: 9 })).accuracy).toBe(78);
  });

  test('UT-BE-02 maxScore of 0 gives accuracy 0 (no NaN / Infinity)', () => {
    const m = computeSessionMetrics(session({ score: 5, maxScore: 0 }));
    expect(m.accuracy).toBe(0);
    expect(Number.isFinite(m.composite)).toBe(true);
  });

  test('UT-BE-03 correctnessRate falls back to accuracy when no answers were recorded', () => {
    const m = computeSessionMetrics(session({ score: 6, maxScore: 10, correctAnswers: 0, totalAnswers: 0 }));
    expect(m.correctnessRate).toBe(m.accuracy);
  });

  test('UT-BE-04 an untimed level gets the neutral speed score of 70', () => {
    expect(computeSessionMetrics(session({ timeTaken: 5 })).speedScore).toBe(70);
  });

  test('UT-BE-05 finishing a timed level in half the allowed time (or less) scores 100 for speed', () => {
    const m = computeSessionMetrics(
      session({ gameId: TIMED.gameId, difficulty: TIMED.difficulty, timeTaken: TIMED.limit * 0.5 }),
    );
    expect(m.speedScore).toBe(100);
  });

  test('UT-BE-06 going 20% (or more) over the time limit floors the speed score at 30', () => {
    const m = computeSessionMetrics(
      session({ gameId: TIMED.gameId, difficulty: TIMED.difficulty, timeTaken: TIMED.limit * 1.5 }),
    );
    expect(m.speedScore).toBe(30);
  });

  test('UT-BE-07 a perfect, fast timed game has a composite of 100 and no metric exceeds 100', () => {
    const m = computeSessionMetrics(
      session({
        gameId: TIMED.gameId,
        difficulty: TIMED.difficulty,
        score: 10,
        maxScore: 10,
        correctAnswers: 10,
        totalAnswers: 10,
        timeTaken: 1,
      }),
    );
    expect(m.composite).toBe(100);

    const over = computeSessionMetrics(session({ score: 50, maxScore: 10, correctAnswers: 50, totalAnswers: 10 }));
    expect(over.accuracy).toBeLessThanOrEqual(100);
    expect(over.correctnessRate).toBeLessThanOrEqual(100);
    expect(over.composite).toBeLessThanOrEqual(100);
  });
});

describe('decideDifficulty', () => {
  const base = { currentDifficulty: 'medium', sessionsSinceLastChange: COOLDOWN };

  test('UT-BE-08 does not change level until WINDOW games have been played', () => {
    const d = decideDifficulty({ ...base, window: [95, 95] });
    expect(WINDOW).toBe(3);
    expect(d.changed).toBe(false);
    expect(d.difficulty).toBe('medium');
  });

  test('UT-BE-09 holds the level during the cooldown even if the window is excellent', () => {
    const d = decideDifficulty({ ...base, sessionsSinceLastChange: COOLDOWN - 1, window: [95, 95, 95] });
    expect(d.changed).toBe(false);
    expect(d.difficulty).toBe('medium');
  });

  test('UT-BE-10 promotes one tier when the window average is >= 80 and every game >= 70', () => {
    const d = decideDifficulty({ ...base, window: [85, 80, 90] });
    expect(d).toMatchObject({ changed: true, direction: 'up', difficulty: 'hard' });
    expect(d.reason).toMatch(/raised the challenge/i);
  });

  test('UT-BE-11 does NOT promote when one game in the window is below 70, even with a high average', () => {
    const d = decideDifficulty({ ...base, window: [100, 100, 65] }); // avg 88
    expect(d.changed).toBe(false);
    expect(d.difficulty).toBe('medium');
  });

  test('UT-BE-12 demotes one tier when the window average is <= 45', () => {
    const d = decideDifficulty({ ...base, window: [40, 45, 30] });
    expect(d).toMatchObject({ changed: true, direction: 'down', difficulty: 'easy' });
  });

  test('UT-BE-13 never goes above hard or below easy', () => {
    const top = decideDifficulty({ currentDifficulty: 'hard', sessionsSinceLastChange: 9, window: [99, 99, 99] });
    const bottom = decideDifficulty({ currentDifficulty: 'easy', sessionsSinceLastChange: 9, window: [5, 5, 5] });
    expect(top).toMatchObject({ changed: false, difficulty: 'hard' });
    expect(bottom).toMatchObject({ changed: false, difficulty: 'easy' });
  });
});
