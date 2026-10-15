// INTEGRATION TESTS - saving game sessions + adaptive difficulty
// Real Express routes + real Mongoose models + in-memory MongoDB.
const request = require('supertest');
const app = require('../helpers/testApp');
const GameSession = require('../../../src/models/cognitive/GameSession');
const PatientGameProgress = require('../../../src/models/cognitive/PatientGameProgress');
const gameProgressService = require('../../../src/services/cognitive/games/gameProgressService');
const { connectTestDB, closeTestDB, clearTestDB } = require('../helpers/testDb');
const { createUser, sessionBody, strongGame, weakGame } = require('../helpers/factories');

beforeAll(connectTestDB);
afterAll(closeTestDB);
afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDB();
});

const base = '/api/cognitive/games/sessions';
const play = (body) => request(app).post(base).send(body);

describe('POST /sessions - saving a completed game', () => {
  test('IT-BE-01 saves a valid session (201) and returns the session plus a progress update', async () => {
    const { user } = await createUser('patient');
    const res = await play(sessionBody(user._id));
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.session.gameId).toBe('memory_recall');
    expect(res.body.data.progress).toMatchObject({ gameId: 'memory_recall', totalSessions: 1, changed: false });
  });

  test('IT-BE-02 persists the session in MongoDB with the right values and a real Date', async () => {
    const { user } = await createUser('patient');
    await play(sessionBody(user._id, { score: 7, correctAnswers: 7, timeTaken: 33 }));
    const saved = await GameSession.findOne({ patientId: user._id }).lean();
    expect(saved).toMatchObject({ gameId: 'memory_recall', difficulty: 'medium', score: 7, timeTaken: 33 });
    expect(saved.completedAt).toBeInstanceOf(Date);
  });

  test('IT-BE-03 the first play seeds PatientGameProgress at the difficulty it was played at', async () => {
    const { user } = await createUser('patient');
    await play(sessionBody(user._id, { difficulty: 'hard' }));
    const progress = await PatientGameProgress.findOne({ patientId: user._id, gameId: 'memory_recall' }).lean();
    expect(progress.difficulty).toBe('hard');
    expect(progress.totalSessions).toBe(1);
    expect(progress.recentScores).toHaveLength(1);
  });

  test('IT-BE-04 rejects a payload with missing fields (400) and saves nothing', async () => {
    const { user } = await createUser('patient');
    const { score, ...incomplete } = sessionBody(user._id);
    const res = await play(incomplete);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.details.missing).toContain('score');
    expect(await GameSession.countDocuments()).toBe(0);
    expect(await PatientGameProgress.countDocuments()).toBe(0);
  });

  test('IT-BE-05 rejects an unknown gameId and saves nothing', async () => {
    const { user } = await createUser('patient');
    const res = await play(sessionBody(user._id, { gameId: 'not_a_real_game' }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
    expect(await GameSession.countDocuments()).toBe(0);
  });

  test('IT-BE-06 every one of the 16 games persists in BOTH GameSession and PatientGameProgress', async () => {
    // Guards the "two gameId enums" trap: add a game to one enum and forget the
    // other and saving silently stops working for that game.
    const { GAME_IDS } = PatientGameProgress;
    expect(GAME_IDS).toHaveLength(16);
    const { user } = await createUser('patient');
    for (const gameId of GAME_IDS) {
      const res = await play(sessionBody(user._id, { gameId }));
      expect(res.status).toBe(201);
      expect(res.body.data.progress).not.toBeNull();
    }
    expect(await GameSession.countDocuments({ patientId: user._id })).toBe(16);
    expect(await PatientGameProgress.countDocuments({ patientId: user._id })).toBe(16);
  });
});

describe('Adaptive difficulty through the API', () => {
  test('IT-BE-07 three strong games promote medium -> hard and record why', async () => {
    const { user } = await createUser('patient');
    let last;
    for (let i = 0; i < 3; i += 1) last = await play(sessionBody(user._id, { difficulty: 'medium', ...strongGame }));
    expect(last.body.data.progress).toMatchObject({ changed: true, previousDifficulty: 'medium', difficulty: 'hard' });
    expect(last.body.data.progress.reason).toMatch(/raised the challenge/i);

    const saved = await PatientGameProgress.findOne({ patientId: user._id }).lean();
    expect(saved.difficulty).toBe('hard');
    expect(saved.sessionsSinceLastChange).toBe(0);
    expect(saved.changeHistory).toHaveLength(1);
    expect(saved.changeHistory[0]).toMatchObject({ from: 'medium', to: 'hard', direction: 'up' });
  });

  test('IT-BE-08 three weak games ease medium -> easy', async () => {
    const { user } = await createUser('patient');
    let last;
    for (let i = 0; i < 3; i += 1) last = await play(sessionBody(user._id, { difficulty: 'medium', ...weakGame }));
    expect(last.body.data.progress).toMatchObject({ changed: true, difficulty: 'easy' });
    const saved = await PatientGameProgress.findOne({ patientId: user._id }).lean();
    expect(saved.changeHistory[0].direction).toBe('down');
  });

  test('IT-BE-09 the cooldown stops a second change straight after the first', async () => {
    const { user } = await createUser('patient');
    for (let i = 0; i < 3; i += 1) await play(sessionBody(user._id, { difficulty: 'easy', ...strongGame })); // easy -> medium
    const next = await play(sessionBody(user._id, { difficulty: 'medium', ...strongGame }));
    expect(next.body.data.progress.changed).toBe(false);
    expect(next.body.data.progress.difficulty).toBe('medium'); // would be "hard" without the cooldown
    const saved = await PatientGameProgress.findOne({ patientId: user._id }).lean();
    expect(saved.changeHistory).toHaveLength(1);
  });

  test('IT-BE-10 if difficulty bookkeeping fails the session is STILL saved and progress is null', async () => {
    jest.spyOn(gameProgressService, 'recordSessionAndAdapt').mockRejectedValue(new Error('db hiccup'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { user } = await createUser('patient');
    const res = await play(sessionBody(user._id));
    expect(res.status).toBe(201);
    expect(res.body.data.progress).toBeNull();
    expect(await GameSession.countDocuments({ patientId: user._id })).toBe(1);
  });
});
