// INTEGRATION TESTS - AI Coach route (LLM provider faked with a mock fetch)
const request = require('supertest');
const app = require('../helpers/testApp');
const { connectTestDB, closeTestDB, clearTestDB } = require('../helpers/testDb');
const { createUser } = require('../helpers/factories');

beforeAll(connectTestDB);
afterAll(closeTestDB);
afterEach(async () => { await clearTestDB(); delete global.fetch; });

const url = '/api/caregiver/ai-coach/personalize';
const body = {
  stressLevel: 'High', stressScore: 8,
  weekly: { riskLevel: 'High', trend: 'worsening', avgSleep: 4, consecutiveHigh: 3, factors: [] },
  recs: [{ id: 'sleep', title: 'Sleep', primaryCause: 'Low sleep', recommendations: ['Sleep early'] }],
};
const llmOk = () => jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ message: 'Be kind to yourself.', notes: { sleep: 'Rest tonight.' } }) } }] }) });

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'fake'; process.env.OPENAI_BASE_URL = 'http://fake.test/v1'; process.env.OPENAI_JSON_MODE = 'off';
});

describe('POST /api/caregiver/ai-coach/personalize', () => {
  test('IT-BE-64 requires login (401)', async () => {
    expect((await request(app).post(url).send(body)).status).toBe(401);
  });

  test('IT-BE-65 caregivers only - a patient gets 403', async () => {
    const { token } = await createUser('patient');
    expect((await request(app).post(url).set('Authorization', `Bearer ${token}`).send(body)).status).toBe(403);
  });

  test('IT-BE-66 missing stressLevel or recs -> 400', async () => {
    const { token } = await createUser();
    const h = { Authorization: `Bearer ${token}` };
    expect((await request(app).post(url).set(h).send({ recs: body.recs })).status).toBe(400);
    expect((await request(app).post(url).set(h).send({ stressLevel: 'High', recs: [] })).status).toBe(400);
  });

  test('IT-BE-67 returns the personalised message from the (fake) LLM', async () => {
    const { token } = await createUser();
    global.fetch = llmOk();
    const res = await request(app).post(url).set('Authorization', `Bearer ${token}`).send(body);
    expect(res.status).toBe(200);
    expect(res.body.personalized.message).toBe('Be kind to yourself.');
    expect(res.body.personalized.notes.sleep).toBe('Rest tonight.');
  });

  test('IT-BE-68 LLM failure -> still success:true with personalized:null (app falls back to rules)', async () => {
    const { token } = await createUser();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    global.fetch = jest.fn().mockRejectedValue(new Error('provider down'));
    const res = await request(app).post(url).set('Authorization', `Bearer ${token}`).send(body);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.personalized).toBeNull();
    jest.restoreAllMocks();
  });

  test('IT-BE-69 no API key configured -> personalized:null and the LLM is never called', async () => {
    const { token } = await createUser();
    delete process.env.OPENAI_API_KEY;
    global.fetch = jest.fn();
    const res = await request(app).post(url).set('Authorization', `Bearer ${token}`).send(body);
    expect(res.body.personalized).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('IT-BE-70 oversized input is trimmed to 8 recommendations / 3 actions each', async () => {
    const { token } = await createUser();
    global.fetch = llmOk();
    const recs = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, title: 't', primaryCause: 'c', recommendations: ['a', 'b', 'c', 'd', 'e'] }));
    await request(app).post(url).set('Authorization', `Bearer ${token}`).send({ ...body, recs });
    const prompt = JSON.parse(global.fetch.mock.calls[0][1].body).messages[1].content;
    expect(prompt.match(/id="r\d+"/g)).toHaveLength(8);
    expect(prompt).not.toMatch(/ \/ d/);
  });
});
