// INTEGRATION TESTS - Daily check-in -> ML result -> saved -> burnout -> notification
// The Flask ML service is faked (axios is mocked) so the test does not need Python running.
jest.mock('axios');
const axios = require('axios');
const request = require('supertest');
const app = require('../helpers/testApp');
const CheckIn = require('../../../src/models/caregiver/CheckIn');
const Notification = require('../../../src/models/caregiver/Notification');
const { connectTestDB, closeTestDB, clearTestDB } = require('../helpers/testDb');
const { createUser, checkInBody } = require('../helpers/factories');

beforeAll(connectTestDB);
afterAll(closeTestDB);
afterEach(async () => { await clearTestDB(); jest.resetAllMocks(); });

const mlReply = (stressLevel, stressScore) => ({
  data: { success: true, stressLevel, stressScore, confidence: 0.9, message: 'msg', tips: ['tip'], submittedAt: new Date().toISOString() },
});
const url = '/api/caregiver/insights/checkin';

describe('Check-in', () => {
  test('IT-BE-53 requires caregiverId (400) and does not call the ML service', async () => {
    const res = await request(app).post(url).send({ sleepHours: 7 });
    expect(res.status).toBe(400);
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('IT-BE-54 saves the check-in with the ML stress result', async () => {
    const { user } = await createUser();
    axios.post.mockResolvedValue(mlReply('Moderate', 5.2));
    const res = await request(app).post(url).send(checkInBody(user._id, { sleepHours: 7, breaksTaken: 2, mood: 3 }));
    expect(res.status).toBe(200);
    expect(res.body.result.stressLevel).toBe('Moderate');
    const saved = await CheckIn.findOne({ caregiverId: user._id });
    expect(saved.stressLevel).toBe('Moderate');
    expect(saved.stressScore).toBe(5.2);
  });

  test('IT-BE-55 sends only the form answers (not caregiverId) to the ML service', async () => {
    const { user } = await createUser();
    axios.post.mockResolvedValue(mlReply('Low', 2));
    await request(app).post(url).send(checkInBody(user._id));
    const sent = axios.post.mock.calls[0][1];
    expect(sent.caregiverId).toBeUndefined();
    expect(sent.sleepHours).toBe(4);
  });

  test('IT-BE-56 a second check-in on the same day updates, not duplicates', async () => {
    const { user } = await createUser();
    axios.post.mockResolvedValue(mlReply('Low', 2));
    await request(app).post(url).send(checkInBody(user._id));
    await request(app).post(url).send(checkInBody(user._id));
    expect(await CheckIn.countDocuments({ caregiverId: user._id })).toBe(1);
  });

  test('IT-BE-57 a High stress result creates a "warning" notification', async () => {
    const { user } = await createUser();
    axios.post.mockResolvedValue(mlReply('High', 8.5));
    // calm form answers -> weekly burnout stays below High, so only the DAILY alert fires
    await request(app).post(url).send(checkInBody(user._id, { sleepHours: 7, breaksTaken: 2, emotionalOverwhelm: 3, mentallyExhausted: 3, emotionallyDrained: 3, tasksAssigned: 10, tasksCompleted: 10 }));
    const notes = await Notification.find({ caregiverId: user._id });
    expect(notes).toHaveLength(1);
    expect(notes[0].source).toBe('stress-level');
    expect(notes[0].severity).toBe('warning');
  });

  test('IT-BE-58 a Low stress result creates NO notification', async () => {
    const { user } = await createUser();
    axios.post.mockResolvedValue(mlReply('Low', 1.5));
    await request(app).post(url).send(checkInBody(user._id, { sleepHours: 8, breaksTaken: 3, mood: 5, emotionalOverwhelm: 1, mentallyExhausted: 1, emotionallyDrained: 1, tasksAssigned: 10, tasksCompleted: 10 }));
    expect(await Notification.countDocuments({ caregiverId: user._id })).toBe(0);
  });

  test('IT-BE-59 High WEEKLY burnout creates an "urgent" notification instead of the daily one', async () => {
    const { user } = await createUser();
    // 2 earlier bad days already stored
    const d = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().split('T')[0]; };
    for (const n of [2, 1]) {
      await CheckIn.create({ caregiverId: user._id, checkInDate: d(n), sleepHours: 4, breaksTaken: 0, emotionalOverwhelm: 5, emotionallyDrained: 5, mentallyExhausted: 5, tasksAssigned: 15, tasksCompleted: 5, stressLevel: 'High', stressScore: 8 });
    }
    axios.post.mockResolvedValue(mlReply('High', 8.5));
    const res = await request(app).post(url).send(checkInBody(user._id));
    expect(res.body.result.burnout.riskLevel).toBe('High');
    const notes = await Notification.find({ caregiverId: user._id });
    expect(notes).toHaveLength(1);
    expect(notes[0].severity).toBe('urgent');
    expect(notes[0].source).toBe('burnout');
  });

  test('IT-BE-60 ML service offline -> clear 503 message', async () => {
    const { user } = await createUser();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    axios.post.mockRejectedValue(Object.assign(new Error('connect refused'), { code: 'ECONNREFUSED' }));
    const res = await request(app).post(url).send(checkInBody(user._id));
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/ML service not running/);
    expect(await CheckIn.countDocuments()).toBe(0);
    jest.restoreAllMocks();
  });

  test('IT-BE-61 ML returns success:false -> 500 and nothing saved', async () => {
    const { user } = await createUser();
    axios.post.mockResolvedValue({ data: { success: false } });
    const res = await request(app).post(url).send(checkInBody(user._id));
    expect(res.status).toBe(500);
    expect(await CheckIn.countDocuments()).toBe(0);
  });

  test('IT-BE-62 GET latest returns the saved result with burnout info', async () => {
    const { user } = await createUser();
    axios.post.mockResolvedValue(mlReply('Moderate', 5));
    await request(app).post(url).send(checkInBody(user._id));
    const res = await request(app).get(`/api/caregiver/insights/latest/${user._id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.result.stressLevel).toBe('Moderate');
    expect(res.body.result.burnout).toBeDefined();
  });

  test('IT-BE-63 GET latest with no check-ins returns success:false', async () => {
    const { user } = await createUser();
    const res = await request(app).get(`/api/caregiver/insights/latest/${user._id}`);
    expect(res.body.success).toBe(false);
    expect(res.body.result).toBeNull();
  });
});
