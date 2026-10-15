// SYSTEM TESTS - whole caregiver journeys, from the outside, in the same order a real
// person uses the app. Each step uses ONLY the API (no direct database shortcuts),
// the way the mobile app does. Only two outside things are faked: the Flask ML service
// and the LLM provider (so tests are free and repeatable).
jest.mock('axios');
const axios = require('axios');
const request = require('supertest');
const app = require('../helpers/testApp');
const { connectTestDB, closeTestDB, clearTestDB } = require('../helpers/testDb');

beforeAll(connectTestDB);
afterAll(closeTestDB);
afterEach(async () => { await clearTestDB(); jest.resetAllMocks(); delete global.fetch; });

const ml = (stressLevel, stressScore) => ({ data: { success: true, stressLevel, stressScore, confidence: 0.9, message: 'm', tips: [], submittedAt: new Date().toISOString() } });
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

const signUpAndLogin = async (role, name, email) => {
  const r = await request(app).post('/api/auth/register').send({ fullName: name, email, password: 'Password123', role });
  expect(r.status).toBe(201);
  const l = await request(app).post('/api/auth/login').send({ email, password: 'Password123' });
  expect(l.status).toBe(200);
  return { token: l.body.data.accessToken, id: l.body.data.user.id };
};

describe('ST-01 Caregiver adds a registered patient, plans the day and finishes tasks', () => {
  test('ST-01 register -> login -> pick patient from dropdown -> add -> task -> done -> remove', async () => {
    const cg = await signUpAndLogin('caregiver', 'Nimali Silva', 'nimali@test.com');
    const pt = await signUpAndLogin('patient', 'Mihisara Senarath', 'mihisara@test.com');

    // 1. The dropdown offers the registered patient
    let dropdown = await request(app).get('/api/patients/registered').set(bearer(cg.token));
    expect(dropdown.body.patients.map((p) => p.fullName)).toContain('Mihisara Senarath');

    // 2. Caregiver adds that patient to the Patients module
    const add = await request(app).post('/api/caregiver/patients').set(bearer(cg.token))
      .send({ name: 'Mihisara Senarath', initials: 'MS', age: 80, condition: 'Moderate', stage: 'Stage 3', userId: pt.id });
    expect(add.status).toBe(201);
    const patientId = add.body.patient._id;

    // 3. The patient disappears from the dropdown and cannot be added twice
    dropdown = await request(app).get('/api/patients/registered').set(bearer(cg.token));
    expect(dropdown.body.patients.map((p) => p.fullName)).not.toContain('Mihisara Senarath');
    const dup = await request(app).post('/api/caregiver/patients').set(bearer(cg.token))
      .send({ name: 'Mihisara Senarath', initials: 'MS', age: 80, condition: 'Moderate', stage: 'Stage 3', userId: pt.id });
    expect(dup.status).toBe(409);

    // 4. Add a daily routine and complete it
    const routine = await request(app).post(`/api/caregiver/patients/${patientId}/routines`).set(bearer(cg.token)).send({ title: 'Morning walk', time: '7:00 AM' });
    const toggled = await request(app).patch(`/api/caregiver/patients/${patientId}/routines/${routine.body.routine._id}/toggle`).set(bearer(cg.token));
    expect(toggled.body.routine.completed).toBe(true);

    // 5. Create a task for the patient and mark it done
    const task = await request(app).post('/api/caregiver/tasks').set(bearer(cg.token))
      .send({ title: 'Give medicine', patientName: 'Mihisara Senarath', patientInitials: 'MS', time: '9:00 AM', date: '2099-01-01' });
    expect(task.status).toBe(201);
    await request(app).patch(`/api/caregiver/tasks/${task.body.task._id}/toggle`).set(bearer(cg.token));
    const tasks = await request(app).get('/api/caregiver/tasks').set(bearer(cg.token));
    expect(tasks.body.counts).toEqual({ all: 1, todo: 0, done: 1 });

    // 6. Remove the patient: list is empty and the patient is selectable again
    await request(app).delete(`/api/caregiver/patients/${patientId}`).set(bearer(cg.token));
    expect((await request(app).get('/api/caregiver/patients').set(bearer(cg.token))).body.count).toBe(0);
    dropdown = await request(app).get('/api/patients/registered').set(bearer(cg.token));
    expect(dropdown.body.patients.map((p) => p.fullName)).toContain('Mihisara Senarath');
  });
});

describe('ST-02 Stressful day: check-in -> alert -> acknowledge -> AI coach', () => {
  test('ST-02 check-in High stress -> notification appears -> acknowledged -> AI coach message', async () => {
    const cg = await signUpAndLogin('caregiver', 'Nimali Silva', 'nimali2@test.com');
    axios.post.mockResolvedValue(ml('High', 8.8));

    // 1. Submit a stressful check-in
    const checkin = await request(app).post('/api/caregiver/insights/checkin').send({
      caregiverId: cg.id, sleepHours: 4, physicalTiredness: 5, mood: 1, emotionalOverwhelm: 5, hoursCaregiving: 14,
      tasksAssigned: 15, tasksCompleted: 4, difficultSituations: 5, breaksTaken: 0, mentallyExhausted: 5, difficultyManaging: 5, emotionallyDrained: 5,
    });
    expect(checkin.status).toBe(200);
    expect(checkin.body.result.stressLevel).toBe('High');
    const burnout = checkin.body.result.burnout;

    // 2. An alert is waiting in the notification centre
    const list = await request(app).get('/api/caregiver/notifications').set(bearer(cg.token));
    expect(list.body.notifications.length).toBeGreaterThanOrEqual(1);
    expect(list.body.notifications[0].acknowledged).toBe(false);

    // 3. Caregiver acknowledges everything
    await request(app).patch('/api/caregiver/notifications/acknowledge-all').set(bearer(cg.token));
    const after = await request(app).get('/api/caregiver/notifications').set(bearer(cg.token));
    expect(after.body.notifications.every((n) => n.acknowledged)).toBe(true);

    // 4. Smart Care Coach writes a personal note (LLM faked)
    process.env.OPENAI_API_KEY = 'fake'; process.env.OPENAI_BASE_URL = 'http://fake.test/v1'; process.env.OPENAI_JSON_MODE = 'off';
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ message: 'It has been a heavy week. Please rest tonight.', notes: { sleep: 'Aim for bed early.' } }) } }] }) });
    const coach = await request(app).post('/api/caregiver/ai-coach/personalize').set(bearer(cg.token)).send({
      stressLevel: checkin.body.result.stressLevel, stressScore: checkin.body.result.stressScore, weekly: burnout,
      recs: [{ id: 'sleep', title: 'Sleep', primaryCause: 'Low sleep', recommendations: ['Sleep early'] }],
    });
    expect(coach.body.personalized.message).toMatch(/rest tonight/);

    // 5. Dashboard "latest" endpoint shows the same result
    const latest = await request(app).get(`/api/caregiver/insights/latest/${cg.id}`);
    expect(latest.body.result.stressLevel).toBe('High');
  });
});

describe('ST-03 Security: one caregiver can never see another caregiver\'s data', () => {
  test('ST-03 patients, tasks and notifications stay private', async () => {
    const a = await signUpAndLogin('caregiver', 'Caregiver A', 'a@test.com');
    const b = await signUpAndLogin('caregiver', 'Caregiver B', 'b@test.com');
    const p = await request(app).post('/api/caregiver/patients').set(bearer(a.token)).send({ name: 'A Patient', initials: 'AP', age: 70, condition: 'Mild', stage: 'Stage 2' });
    await request(app).post('/api/caregiver/tasks').set(bearer(a.token)).send({ title: 'A task', patientName: 'A Patient', patientInitials: 'AP', time: '9:00 AM', date: '2099-01-01' });

    expect((await request(app).get('/api/caregiver/patients').set(bearer(b.token))).body.count).toBe(0);
    expect((await request(app).get(`/api/caregiver/patients/${p.body.patient._id}`).set(bearer(b.token))).status).toBe(404);
    expect((await request(app).get('/api/caregiver/tasks').set(bearer(b.token))).body.tasks).toHaveLength(0);
    expect((await request(app).get('/api/caregiver/notifications').set(bearer(b.token))).body.notifications).toHaveLength(0);
    expect((await request(app).get('/api/caregiver/patients')).status).toBe(401);
  });
});

describe('ST-04 Resilience: the app keeps working when helpers are down', () => {
  test('ST-04 ML service down gives a clear error; AI coach down falls back to rules', async () => {
    const cg = await signUpAndLogin('caregiver', 'Nimali Silva', 'nimali3@test.com');
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});

    axios.post.mockRejectedValue(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }));
    const checkin = await request(app).post('/api/caregiver/insights/checkin').send({ caregiverId: cg.id, sleepHours: 6 });
    expect(checkin.status).toBe(503);

    process.env.OPENAI_API_KEY = 'fake';
    global.fetch = jest.fn().mockRejectedValue(new Error('LLM down'));
    const coach = await request(app).post('/api/caregiver/ai-coach/personalize').set(bearer(cg.token)).send({
      stressLevel: 'Moderate', stressScore: 5, recs: [{ id: 'x', title: 't', primaryCause: 'c', recommendations: ['a'] }],
    });
    expect(coach.status).toBe(200);
    expect(coach.body.personalized).toBeNull();
    jest.restoreAllMocks();
  });
});
