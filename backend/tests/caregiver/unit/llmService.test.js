// UNIT TESTS - AI Coach (LLM) service. The real internet/LLM is NEVER called:
// global.fetch is replaced with a fake, so tests are free, fast and repeatable.
const { personalizeRecommendations, buildUserPrompt } = require('../../../src/services/caregiver/llmService');

const payload = {
  stressLevel: 'High', stressScore: 8.2,
  weekly: { riskLevel: 'High', trend: 'worsening', avgSleep: 4.5, consecutiveHigh: 3, factors: [{ factor: 'Sleep deprivation' }] },
  recs: [
    { id: 'sleep', title: 'Improve sleep', primaryCause: 'Low sleep', recommendations: ['Sleep early', 'No screens', 'Quiet room', 'extra'] },
    { id: 'breaks', title: 'Take breaks', primaryCause: 'No breaks', recommendations: ['Rest 10 min'] },
  ],
};

const fakeLlmReply = (content, ok = true, status = 200) =>
  jest.fn().mockResolvedValue({ ok, status, json: async () => ({ choices: [{ message: { content } }] }) });

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'fake-key';
  process.env.OPENAI_BASE_URL = 'http://fake-llm.test/v1';
  process.env.OPENAI_MODEL = 'fake-model';
  process.env.OPENAI_JSON_MODE = 'off';
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); delete global.fetch; });

describe('buildUserPrompt (privacy + content)', () => {
  test('UT-BE-16 includes stress level, weekly picture and every recommendation id', () => {
    const text = buildUserPrompt(payload);
    expect(text).toMatch(/High \(8.2\/10\)/);
    expect(text).toMatch(/burnout risk High, trend worsening/);
    expect(text).toMatch(/Sleep deprivation/);
    expect(text).toMatch(/id="sleep"/);
    expect(text).toMatch(/id="breaks"/);
  });

  test('UT-BE-17 sends only the first 3 actions of a recommendation', () => {
    expect(buildUserPrompt(payload)).not.toMatch(/extra/);
  });

  test('UT-BE-18 works when there is no weekly data', () => {
    expect(() => buildUserPrompt({ ...payload, weekly: undefined })).not.toThrow();
  });
});

describe('personalizeRecommendations', () => {
  test('UT-BE-19 returns null when no API key is configured (safe fallback)', async () => {
    delete process.env.OPENAI_API_KEY;
    global.fetch = jest.fn();
    expect(await personalizeRecommendations(payload)).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('UT-BE-20 returns the message and notes from a valid LLM reply', async () => {
    global.fetch = fakeLlmReply(JSON.stringify({ message: ' You are doing great. ', notes: { sleep: ' Try sleeping early. ' } }));
    const r = await personalizeRecommendations(payload);
    expect(r.message).toBe('You are doing great.');
    expect(r.notes).toEqual({ sleep: 'Try sleeping early.' });
  });

  test('UT-BE-21 strips ```json fences some models add', async () => {
    global.fetch = fakeLlmReply('```json\n{"message":"Hello","notes":{}}\n```');
    expect((await personalizeRecommendations(payload)).message).toBe('Hello');
  });

  test('UT-BE-22 drops notes for recommendation ids that were never sent', async () => {
    global.fetch = fakeLlmReply(JSON.stringify({ message: 'Hi', notes: { sleep: 'ok', hacked: 'bad' } }));
    const r = await personalizeRecommendations(payload);
    expect(Object.keys(r.notes)).toEqual(['sleep']);
  });

  test('UT-BE-23 returns null when the LLM replies with broken JSON', async () => {
    global.fetch = fakeLlmReply('this is not json');
    expect(await personalizeRecommendations(payload)).toBeNull();
  });

  test('UT-BE-24 returns null when the reply has no message', async () => {
    global.fetch = fakeLlmReply(JSON.stringify({ notes: {} }));
    expect(await personalizeRecommendations(payload)).toBeNull();
  });

  test('UT-BE-25 returns null when the provider answers with an error status (e.g. 429)', async () => {
    global.fetch = fakeLlmReply('{}', false, 429);
    expect(await personalizeRecommendations(payload)).toBeNull();
  });

  test('UT-BE-26 returns null (does not crash) when the network call throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    expect(await personalizeRecommendations(payload)).toBeNull();
  });

  test('UT-BE-27 sends the key, model and URL from the environment settings', async () => {
    global.fetch = fakeLlmReply(JSON.stringify({ message: 'Hi', notes: {} }));
    await personalizeRecommendations(payload);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://fake-llm.test/v1/chat/completions');
    expect(options.headers.Authorization).toBe('Bearer fake-key');
    const body = JSON.parse(options.body);
    expect(body.model).toBe('fake-model');
    expect(body.response_format).toBeUndefined(); // JSON mode is off
  });

  test('UT-BE-28 never sends patient names or the caregiver email to the LLM', async () => {
    global.fetch = fakeLlmReply(JSON.stringify({ message: 'Hi', notes: {} }));
    await personalizeRecommendations(payload);
    const sent = global.fetch.mock.calls[0][1].body;
    expect(sent).not.toMatch(/@/);
    expect(sent).not.toMatch(/Mary Perera/);
  });
});
