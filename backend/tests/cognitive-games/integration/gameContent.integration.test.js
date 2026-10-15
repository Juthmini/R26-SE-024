// INTEGRATION TESTS - game content delivery, fallback tiers and rotation
// The LLM (Groq) and image generator (fal.ai) are mocked: tests must be fast,
// free and must not depend on the internet.
jest.mock('../../../src/services/cognitive/games/llmGameContentService', () => ({
  generateLlmGameContent: jest.fn(),
  generateStoryRecall: jest.fn(),
  generateSentenceCompletion: jest.fn(),
  generateOrientationDistractors: jest.fn(),
  generateFaceNameDecoys: jest.fn(),
  generateImagePrompts: jest.fn(),
}));
jest.mock('../../../src/services/cognitive/games/imageGenerationService', () => ({
  attachGeneratedImages: jest.fn(async (items) => items),
  warmToCache: jest.fn(),
  isCached: jest.fn(() => false),
  CACHE_DIR: '',
}));

const request = require('supertest');
const app = require('../helpers/testApp');
const llm = require('../../../src/services/cognitive/games/llmGameContentService');
const PatientContentHistory = require('../../../src/models/cognitive/PatientContentHistory');
const { GAME_CONTENT } = require('../../../src/services/cognitive/games/staticGameContent');
const { connectTestDB, closeTestDB, clearTestDB } = require('../helpers/testDb');
const { createUser, auth } = require('../helpers/factories');

beforeAll(connectTestDB);
afterAll(closeTestDB);
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  llm.generateLlmGameContent.mockReset().mockResolvedValue(null);
});
afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDB();
});

const content = (gameId, patientId, difficulty, token) =>
  request(app).get(`/api/cognitive/games/content/${gameId}/${patientId}/${difficulty}`).set(auth(token));
const labels = (config) => config.items.map((item) => item.label);

describe('GET /content/:gameId/:patientId/:difficulty', () => {
  test('IT-BE-17 a patient with no profile still gets a full round of static content (200, not personalised)', async () => {
    const { user, token } = await createUser('patient');
    const res = await content('memory_recall', user._id, 'medium', token);
    expect(res.status).toBe(200);
    expect(res.body.data.personalized).toBe(false);
    expect(res.body.data.config.items).toHaveLength(GAME_CONTENT.memory_recall.medium.sequenceLength);
    expect(res.body.data.config.distractors.length).toBeGreaterThan(0);
  });

  test('IT-BE-18 if the LLM crashes the game still loads from the rule-based/static tier', async () => {
    llm.generateLlmGameContent.mockRejectedValue(new Error('Groq is down'));
    const { user, token } = await createUser('patient', { hobbies: ['gardening'], foodsPreferred: [{ id: '1', name: 'rice' }] });
    const res = await content('memory_recall', user._id, 'easy', token);
    expect(res.status).toBe(200);
    expect(res.body.data.config.items).toHaveLength(GAME_CONTENT.memory_recall.easy.sequenceLength);
    expect(llm.generateLlmGameContent).toHaveBeenCalled();
  });

  test('IT-BE-19 rotation: the items served are recorded and the next round shows different ones', async () => {
    const { user, token } = await createUser('patient');
    const first = await content('memory_recall', user._id, 'hard', token);
    const history = await PatientContentHistory.findOne({ patientId: user._id, gameId: 'memory_recall' }).lean();
    expect(history.recentKeys).toHaveLength(GAME_CONTENT.memory_recall.hard.sequenceLength);

    const second = await content('memory_recall', user._id, 'hard', token);
    const overlap = labels(first.body.data.config).filter((l) => labels(second.body.data.config).includes(l));
    expect(overlap).toEqual([]); // the shared pool is big enough to avoid every repeat
  });

  test('IT-BE-20 bad requests are refused: unknown game or difficulty (400) and someone else\'s patient (403)', async () => {
    const mine = await createUser('patient');
    const other = await createUser('patient');

    const badGame = await content('not_a_game', mine.user._id, 'easy', mine.token);
    expect(badGame.status).toBe(400);

    const badLevel = await content('memory_recall', mine.user._id, 'impossible', mine.token);
    expect(badLevel.status).toBe(400);

    const forbidden = await content('memory_recall', other.user._id, 'easy', mine.token);
    expect(forbidden.status).toBe(403);

    const noToken = await request(app).get(`/api/cognitive/games/content/memory_recall/${mine.user._id}/easy`);
    expect(noToken.status).toBe(401);
  });
});
