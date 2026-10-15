// UNIT TESTS - game session payload validation (no database connection needed)
const mongoose = require('mongoose');
const { validateGameSessionPayload } = require('../../../src/services/cognitive/games/gameValidationService');

const valid = (o = {}) => ({
  gameId: 'memory_recall',
  patientId: new mongoose.Types.ObjectId().toString(),
  difficulty: 'easy',
  score: 3,
  maxScore: 5,
  timeTaken: 42,
  correctAnswers: 3,
  totalAnswers: 5,
  completedAt: new Date().toISOString(),
  ...o,
});

const errorOf = (payload) => {
  try {
    validateGameSessionPayload(payload);
  } catch (e) {
    return e;
  }
  return null;
};

describe('validateGameSessionPayload', () => {
  test('UT-BE-19 accepts a complete, well-formed payload (including zero scores)', () => {
    expect(errorOf(valid())).toBeNull();
    expect(errorOf(valid({ score: 0, correctAnswers: 0 }))).toBeNull();
  });

  test('UT-BE-20 rejects bad payloads with HTTP 400 and a useful message', () => {
    const missing = errorOf(valid({ score: undefined, gameId: null }));
    expect(missing.statusCode).toBe(400);
    expect(missing.details.missing).toEqual(expect.arrayContaining(['score', 'gameId']));

    expect(errorOf(valid({ difficulty: 'extreme' })).message).toMatch(/difficulty/i);
    expect(errorOf(valid({ patientId: 'not-an-id' })).message).toMatch(/patientId/i);
    expect(errorOf(valid({ score: -1 })).message).toMatch(/score/i);
    expect(errorOf(valid({ timeTaken: '30' })).message).toMatch(/timeTaken/i);
    expect(errorOf(valid({ completedAt: 'yesterday-ish' })).message).toMatch(/completedAt/i);
    expect(errorOf(undefined).statusCode).toBe(400);
  });
});
