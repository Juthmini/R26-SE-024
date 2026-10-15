// INTEGRATION TESTS - reading sessions / progress / reports + who is allowed to
const request = require('supertest');
const app = require('../helpers/testApp');
const { connectTestDB, closeTestDB, clearTestDB } = require('../helpers/testDb');
const { createUser, auth, sessionBody, strongGame, newId } = require('../helpers/factories');

beforeAll(connectTestDB);
afterAll(closeTestDB);
afterEach(clearTestDB);

const base = '/api/cognitive/games';
const play = (body) => request(app).post(`${base}/sessions`).send(body);

describe('Authentication and authorisation', () => {
  test('IT-BE-11 reading progress without a token is refused (401)', async () => {
    const res = await request(app).get(`${base}/progress/${newId()}`);
    expect(res.status).toBe(401);
  });

  test('IT-BE-12 a patient can read their OWN progress', async () => {
    const { user, token } = await createUser('patient');
    await play(sessionBody(user._id, { gameId: 'go_no_go' }));
    const res = await request(app).get(`${base}/progress/${user._id}`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data.progress).toHaveLength(1);
    expect(res.body.data.progress[0]).toMatchObject({ gameId: 'go_no_go', difficulty: 'medium', totalSessions: 1 });
  });

  test('IT-BE-13 a patient cannot read ANOTHER patient\'s progress, sessions or report (403)', async () => {
    const a = await createUser('patient');
    const b = await createUser('patient');
    await play(sessionBody(b.user._id));
    for (const path of [`progress/${b.user._id}`, `sessions/patient/${b.user._id}`, `progress/${b.user._id}/report`]) {
      const res = await request(app).get(`${base}/${path}`).set(auth(a.token));
      expect(res.status).toBe(403);
    }
  });

  test('IT-BE-14 only the ASSIGNED caregiver can read a patient\'s progress', async () => {
    const assigned = await createUser('caregiver');
    const stranger = await createUser('caregiver');
    const patient = await createUser('patient', { assignedCaregiverId: assigned.user._id });
    await play(sessionBody(patient.user._id));

    const ok = await request(app).get(`${base}/progress/${patient.user._id}`).set(auth(assigned.token));
    expect(ok.status).toBe(200);
    expect(ok.body.data.progress).toHaveLength(1);

    const denied = await request(app).get(`${base}/progress/${patient.user._id}`).set(auth(stranger.token));
    expect(denied.status).toBe(403);
  });
});

describe('Reading history', () => {
  test('IT-BE-15 sessions come back newest first, and a malformed patient id is a 400', async () => {
    const { user, token } = await createUser('patient');
    await play(sessionBody(user._id, { score: 1, completedAt: '2025-01-01T10:00:00.000Z' }));
    await play(sessionBody(user._id, { score: 2, completedAt: '2025-03-01T10:00:00.000Z' }));
    await play(sessionBody(user._id, { score: 3, completedAt: '2025-02-01T10:00:00.000Z' }));

    const res = await request(app).get(`${base}/sessions/patient/${user._id}`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data.sessions.map((s) => s.score)).toEqual([2, 3, 1]);

    const bad = await request(app).get(`${base}/sessions/patient/not-an-id`).set(auth(token));
    expect(bad.status).toBe(400);
  });

  test('IT-BE-16 the difficulty report lists the level-change timeline with its reason', async () => {
    const { user, token } = await createUser('patient');
    for (let i = 0; i < 3; i += 1) await play(sessionBody(user._id, { difficulty: 'easy', ...strongGame }));

    const res = await request(app).get(`${base}/progress/${user._id}/report`).set(auth(token));
    expect(res.status).toBe(200);
    const [report] = res.body.data.report;
    expect(report).toMatchObject({ gameId: 'memory_recall', currentDifficulty: 'medium', totalSessions: 3, changeCount: 1 });
    expect(report.changeHistory[0]).toMatchObject({ from: 'easy', to: 'medium', direction: 'up' });
    expect(report.changeHistory[0].reason).toMatch(/raised the challenge/i);
    expect(report.averageComposite).toBeGreaterThanOrEqual(80);
  });
});
