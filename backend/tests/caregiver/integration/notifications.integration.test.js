// INTEGRATION TESTS - Notifications API
const request = require('supertest');
const app = require('../helpers/testApp');
const Notification = require('../../../src/models/caregiver/Notification');
const { createNotification } = require('../../../src/controllers/caregiver/Notificationcontroller');
const { connectTestDB, closeTestDB, clearTestDB } = require('../helpers/testDb');
const { createUser } = require('../helpers/factories');

beforeAll(connectTestDB);
afterAll(closeTestDB);
afterEach(clearTestDB);

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const base = '/api/caregiver/notifications';

describe('Notifications', () => {
  test('IT-BE-46 empty list for a new caregiver', async () => {
    const { token } = await createUser();
    const res = await request(app).get(base).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.notifications).toEqual([]);
  });

  test('IT-BE-47 rejects the request without a token (401)', async () => {
    expect((await request(app).get(base)).status).toBe(401);
  });

  test('IT-BE-48 returns newest first and only MY notifications', async () => {
    const a = await createUser();
    const b = await createUser();
    await createNotification({ caregiverId: a.user._id, message: 'first' });
    await new Promise((r) => setTimeout(r, 15));
    await createNotification({ caregiverId: a.user._id, message: 'second' });
    await createNotification({ caregiverId: b.user._id, message: 'not mine' });
    const res = await request(app).get(base).set(auth(a.token));
    expect(res.body.notifications.map((n) => n.message)).toEqual(['second', 'first']);
  });

  test('IT-BE-49 acknowledges one notification', async () => {
    const { token, user } = await createUser();
    const n = await createNotification({ caregiverId: user._id, message: 'hello' });
    const res = await request(app).patch(`${base}/${n._id}/acknowledge`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.notification.acknowledged).toBe(true);
  });

  test('IT-BE-50 cannot acknowledge someone else\'s notification (404)', async () => {
    const a = await createUser();
    const b = await createUser();
    const n = await createNotification({ caregiverId: a.user._id, message: 'private' });
    const res = await request(app).patch(`${base}/${n._id}/acknowledge`).set(auth(b.token));
    expect(res.status).toBe(404);
    expect((await Notification.findById(n._id)).acknowledged).toBe(false);
  });

  test('IT-BE-51 acknowledge-all only affects my notifications', async () => {
    const a = await createUser();
    const b = await createUser();
    await createNotification({ caregiverId: a.user._id, message: '1' });
    await createNotification({ caregiverId: a.user._id, message: '2' });
    await createNotification({ caregiverId: b.user._id, message: 'other' });
    const res = await request(app).patch(`${base}/acknowledge-all`).set(auth(a.token));
    expect(res.status).toBe(200);
    expect(await Notification.countDocuments({ caregiverId: a.user._id, acknowledged: false })).toBe(0);
    expect(await Notification.countDocuments({ caregiverId: b.user._id, acknowledged: false })).toBe(1);
  });

  test('IT-BE-52 createNotification never throws, even with bad data', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(createNotification({ caregiverId: 'bad-id', message: 'x' })).resolves.toBeNull();
    jest.restoreAllMocks();
  });
});
