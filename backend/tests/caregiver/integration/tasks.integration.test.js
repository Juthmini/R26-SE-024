// INTEGRATION TESTS - Tasks module (+ overdue-task notification)
const request = require('supertest');
const app = require('../helpers/testApp');
const Task = require('../../../src/models/caregiver/Task');
const Notification = require('../../../src/models/caregiver/Notification');
const { connectTestDB, closeTestDB, clearTestDB } = require('../helpers/testDb');
const { createUser, taskBody } = require('../helpers/factories');

beforeAll(connectTestDB);
afterAll(closeTestDB);
afterEach(clearTestDB);

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const base = '/api/caregiver/tasks';

describe('Tasks CRUD', () => {
  test('IT-BE-33 creates a task (201), default status todo', async () => {
    const { token } = await createUser();
    const res = await request(app).post(base).set(auth(token)).send(taskBody());
    expect(res.status).toBe(201);
    expect(res.body.task.status).toBe('todo');
    expect(res.body.task.priority).toBe('medium');
  });

  test('IT-BE-34 rejects a task with missing fields (400)', async () => {
    const { token } = await createUser();
    const res = await request(app).post(base).set(auth(token)).send({ title: 'Only a title' });
    expect(res.status).toBe(400);
  });

  test('IT-BE-35 lists my tasks with correct counts', async () => {
    const { token } = await createUser();
    const t = await request(app).post(base).set(auth(token)).send(taskBody({ title: 'One' }));
    await request(app).post(base).set(auth(token)).send(taskBody({ title: 'Two' }));
    await request(app).patch(`${base}/${t.body.task._id}/toggle`).set(auth(token));
    const res = await request(app).get(base).set(auth(token));
    expect(res.body.counts).toEqual({ all: 2, todo: 1, done: 1 });
  });

  test('IT-BE-36 filters tasks by date', async () => {
    const { token } = await createUser();
    await request(app).post(base).set(auth(token)).send(taskBody({ date: '2099-01-01' }));
    await request(app).post(base).set(auth(token)).send(taskBody({ date: '2099-01-02' }));
    const res = await request(app).get(`${base}?date=2099-01-02`).set(auth(token));
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.tasks[0].date).toBe('2099-01-02');
  });

  test('IT-BE-37 never shows another caregiver\'s tasks', async () => {
    const a = await createUser();
    const b = await createUser();
    await request(app).post(base).set(auth(a.token)).send(taskBody());
    const res = await request(app).get(base).set(auth(b.token));
    expect(res.body.tasks).toHaveLength(0);
  });

  test('IT-BE-38 toggle flips todo -> done -> todo', async () => {
    const { token } = await createUser();
    const t = await request(app).post(base).set(auth(token)).send(taskBody());
    const id = t.body.task._id;
    expect((await request(app).patch(`${base}/${id}/toggle`).set(auth(token))).body.task.status).toBe('done');
    expect((await request(app).patch(`${base}/${id}/toggle`).set(auth(token))).body.task.status).toBe('todo');
  });

  test('IT-BE-39 updates a task', async () => {
    const { token } = await createUser();
    const t = await request(app).post(base).set(auth(token)).send(taskBody());
    const res = await request(app).put(`${base}/${t.body.task._id}`).set(auth(token)).send({ title: 'Changed', priority: 'high' });
    expect(res.status).toBe(200);
    expect(res.body.task.title).toBe('Changed');
    expect(res.body.task.priority).toBe('high');
  });

  test('IT-BE-40 deletes a task; deleting again gives 404', async () => {
    const { token } = await createUser();
    const t = await request(app).post(base).set(auth(token)).send(taskBody());
    const id = t.body.task._id;
    expect((await request(app).delete(`${base}/${id}`).set(auth(token))).status).toBe(200);
    expect((await request(app).delete(`${base}/${id}`).set(auth(token))).status).toBe(404);
  });

  test('IT-BE-41 another caregiver cannot toggle my task (404)', async () => {
    const a = await createUser();
    const b = await createUser();
    const t = await request(app).post(base).set(auth(a.token)).send(taskBody());
    const res = await request(app).patch(`${base}/${t.body.task._id}/toggle`).set(auth(b.token));
    expect(res.status).toBe(404);
  });
});

describe('Overdue-task notification', () => {
  test('IT-BE-42 a task more than 30 min late creates ONE warning notification', async () => {
    const { token, user } = await createUser();
    await request(app).post(base).set(auth(token)).send(taskBody({ title: 'Old task', date: '2020-01-01', time: '8:00 AM' }));
    await request(app).get(base).set(auth(token));
    await request(app).get(base).set(auth(token)); // fetching again must NOT duplicate it
    const notes = await Notification.find({ caregiverId: user._id });
    expect(notes).toHaveLength(1);
    expect(notes[0].severity).toBe('warning');
    expect(notes[0].source).toBe('task');
    expect(notes[0].message).toMatch(/Overdue task: "Old task"/);
    expect((await Task.findOne()).overdueNotified).toBe(true);
  });

  test('IT-BE-43 a task due in the future creates no notification', async () => {
    const { token, user } = await createUser();
    await request(app).post(base).set(auth(token)).send(taskBody({ date: '2099-01-01' }));
    await request(app).get(base).set(auth(token));
    expect(await Notification.countDocuments({ caregiverId: user._id })).toBe(0);
  });

  test('IT-BE-44 a completed task never counts as overdue', async () => {
    const { token, user } = await createUser();
    const t = await request(app).post(base).set(auth(token)).send(taskBody({ date: '2020-01-01' }));
    await request(app).patch(`${base}/${t.body.task._id}/toggle`).set(auth(token));
    await request(app).get(base).set(auth(token));
    expect(await Notification.countDocuments({ caregiverId: user._id })).toBe(0);
  });

  test('IT-BE-45 a task with an unreadable time is skipped, not crashed', async () => {
    const { token } = await createUser();
    await request(app).post(base).set(auth(token)).send(taskBody({ date: '2020-01-01', time: 'after lunch' }));
    const res = await request(app).get(base).set(auth(token));
    expect(res.status).toBe(200);
  });
});
