// INTEGRATION TESTS - Register / Login / protected routes (real routes + temporary database)
const request = require('supertest');
const app = require('../helpers/testApp');
const { connectTestDB, closeTestDB, clearTestDB } = require('../helpers/testDb');
const { createUser } = require('../helpers/factories');

beforeAll(connectTestDB);
afterAll(closeTestDB);
afterEach(clearTestDB);

const reg = (o = {}) => ({ fullName: 'Nimali Silva', email: 'nimali@test.com', password: 'Password123', role: 'caregiver', ...o });

describe('Auth', () => {
  test('IT-BE-01 registers a caregiver and returns tokens', async () => {
    const res = await request(app).post('/api/auth/register').send(reg());
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('caregiver');
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.password).toBeUndefined();
  });

  test('IT-BE-02 rejects an invalid role', async () => {
    const res = await request(app).post('/api/auth/register').send(reg({ role: 'hacker' }));
    expect(res.status).toBe(400);
  });

  test('IT-BE-03 rejects a duplicate email with 409', async () => {
    await request(app).post('/api/auth/register').send(reg());
    const res = await request(app).post('/api/auth/register').send(reg());
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already registered/i);
  });

  test('IT-BE-04 logs in with the correct password', async () => {
    await request(app).post('/api/auth/register').send(reg());
    const res = await request(app).post('/api/auth/login').send({ email: 'nimali@test.com', password: 'Password123' });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  test('IT-BE-05 rejects a wrong password with 401', async () => {
    await request(app).post('/api/auth/register').send(reg());
    const res = await request(app).post('/api/auth/login').send({ email: 'nimali@test.com', password: 'WrongPass1' });
    expect(res.status).toBe(401);
  });

  test('IT-BE-06 rejects login with missing fields (400)', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nimali@test.com' });
    expect(res.status).toBe(400);
  });

  test('IT-BE-07 blocks a deactivated account (403)', async () => {
    const { user } = await createUser('caregiver', { email: 'off@test.com' });
    user.isActive = false;
    await user.save({ validateBeforeSave: false });
    const res = await request(app).post('/api/auth/login').send({ email: 'off@test.com', password: 'Password123' });
    expect(res.status).toBe(403);
  });

  test('IT-BE-08 password is stored hashed, never as plain text', async () => {
    await request(app).post('/api/auth/register').send(reg());
    const User = require('../../../src/models/auth/User');
    const saved = await User.findOne({ email: 'nimali@test.com' }).select('+password');
    expect(saved.password).not.toBe('Password123');
    expect(saved.password).toMatch(/^\$2[aby]\$/);
  });
});

describe('Route protection (JWT + roles)', () => {
  test('IT-BE-09 no token -> 401', async () => {
    const res = await request(app).get('/api/caregiver/patients');
    expect(res.status).toBe(401);
  });

  test('IT-BE-10 garbage token -> 401', async () => {
    const res = await request(app).get('/api/caregiver/patients').set('Authorization', 'Bearer not.a.token');
    expect(res.status).toBe(401);
  });

  test('IT-BE-11 a patient account cannot use caregiver routes -> 403', async () => {
    const { token } = await createUser('patient');
    const res = await request(app).get('/api/caregiver/patients').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('IT-BE-12 GET /api/auth/me returns the logged-in user', async () => {
    const { token, user } = await createUser('caregiver');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user?.email || res.body.data.email).toBe(user.email);
  });
});
