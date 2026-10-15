// INTEGRATION TESTS - Patients module (incl. the "no duplicate patient" fix)
const request = require('supertest');
const app = require('../helpers/testApp');
const Patient = require('../../../src/models/caregiver/Patient');
const User = require('../../../src/models/auth/User');
const { connectTestDB, closeTestDB, clearTestDB } = require('../helpers/testDb');
const { createUser, patientBody } = require('../helpers/factories');

beforeAll(connectTestDB);
afterAll(closeTestDB);
afterEach(clearTestDB);

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const base = '/api/caregiver/patients';

describe('Patients CRUD', () => {
  test('IT-BE-13 creates a patient (201) owned by the logged-in caregiver', async () => {
    const { token, user } = await createUser();
    const res = await request(app).post(base).set(auth(token)).send(patientBody());
    expect(res.status).toBe(201);
    expect(res.body.patient.name).toBe('Mary Perera');
    expect(String(res.body.patient.caregiverId)).toBe(String(user._id));
  });

  test('IT-BE-14 rejects a patient with missing required fields (400)', async () => {
    const { token } = await createUser();
    const res = await request(app).post(base).set(auth(token)).send({ name: 'No Age' });
    expect(res.status).toBe(400);
  });

  test('IT-BE-15 lists only MY patients, never another caregiver\'s', async () => {
    const a = await createUser();
    const b = await createUser();
    await request(app).post(base).set(auth(a.token)).send(patientBody({ name: 'A Patient' }));
    await request(app).post(base).set(auth(b.token)).send(patientBody({ name: 'B Patient' }));
    const res = await request(app).get(base).set(auth(a.token));
    expect(res.body.count).toBe(1);
    expect(res.body.patients[0].name).toBe('A Patient');
  });

  test('IT-BE-16 gets one patient by id', async () => {
    const { token } = await createUser();
    const created = await request(app).post(base).set(auth(token)).send(patientBody());
    const res = await request(app).get(`${base}/${created.body.patient._id}`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.patient.name).toBe('Mary Perera');
  });

  test('IT-BE-17 another caregiver cannot read my patient (404)', async () => {
    const a = await createUser();
    const b = await createUser();
    const created = await request(app).post(base).set(auth(a.token)).send(patientBody());
    const res = await request(app).get(`${base}/${created.body.patient._id}`).set(auth(b.token));
    expect(res.status).toBe(404);
  });

  test('IT-BE-18 updates a patient', async () => {
    const { token } = await createUser();
    const created = await request(app).post(base).set(auth(token)).send(patientBody());
    const res = await request(app).put(`${base}/${created.body.patient._id}`).set(auth(token)).send({ age: 80, condition: 'Critical' });
    expect(res.status).toBe(200);
    expect(res.body.patient.age).toBe(80);
    expect(res.body.patient.condition).toBe('Critical');
  });

  test('IT-BE-19 refuses an invalid condition value on update', async () => {
    const { token } = await createUser();
    const created = await request(app).post(base).set(auth(token)).send(patientBody());
    const res = await request(app).put(`${base}/${created.body.patient._id}`).set(auth(token)).send({ condition: 'Banana' });
    expect(res.status).toBe(500); // validation error surfaces as an error response
    expect(res.body.success).toBe(false);
  });

  test('IT-BE-20 deletes a patient', async () => {
    const { token } = await createUser();
    const created = await request(app).post(base).set(auth(token)).send(patientBody());
    const res = await request(app).delete(`${base}/${created.body.patient._id}`).set(auth(token));
    expect(res.status).toBe(200);
    expect(await Patient.countDocuments()).toBe(0);
  });

  test('IT-BE-21 another caregiver cannot delete my patient (404, record stays)', async () => {
    const a = await createUser();
    const b = await createUser();
    const created = await request(app).post(base).set(auth(a.token)).send(patientBody());
    const res = await request(app).delete(`${base}/${created.body.patient._id}`).set(auth(b.token));
    expect(res.status).toBe(404);
    expect(await Patient.countDocuments()).toBe(1);
  });
});

describe('Routines', () => {
  const setup = async () => {
    const { token } = await createUser();
    const created = await request(app).post(base).set(auth(token)).send(patientBody());
    return { token, id: created.body.patient._id };
  };

  test('IT-BE-22 adds a routine to a patient', async () => {
    const { token, id } = await setup();
    const res = await request(app).post(`${base}/${id}/routines`).set(auth(token)).send({ title: 'Morning walk', time: '7:00 AM' });
    expect(res.status).toBe(201);
    expect(res.body.routine.completed).toBe(false);
  });

  test('IT-BE-23 rejects a routine without title/time (400)', async () => {
    const { token, id } = await setup();
    const res = await request(app).post(`${base}/${id}/routines`).set(auth(token)).send({ title: 'x' });
    expect(res.status).toBe(400);
  });

  test('IT-BE-24 toggles a routine done and back', async () => {
    const { token, id } = await setup();
    const add = await request(app).post(`${base}/${id}/routines`).set(auth(token)).send({ title: 'Walk', time: '7:00 AM' });
    const rid = add.body.routine._id;
    const t1 = await request(app).patch(`${base}/${id}/routines/${rid}/toggle`).set(auth(token));
    expect(t1.body.routine.completed).toBe(true);
    const t2 = await request(app).patch(`${base}/${id}/routines/${rid}/toggle`).set(auth(token));
    expect(t2.body.routine.completed).toBe(false);
  });

  test('IT-BE-25 deletes a routine', async () => {
    const { token, id } = await setup();
    const add = await request(app).post(`${base}/${id}/routines`).set(auth(token)).send({ title: 'Walk', time: '7:00 AM' });
    const res = await request(app).delete(`${base}/${id}/routines/${add.body.routine._id}`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.patient.routines).toHaveLength(0);
  });
});

describe('Add registered patient - duplicate protection (bug fix)', () => {
  test('IT-BE-26 links a registered patient account to the caregiver', async () => {
    const cg = await createUser('caregiver');
    const pt = await createUser('patient', { fullName: 'Mihisara Senarath' });
    const res = await request(app).post(base).set(auth(cg.token)).send(patientBody({ name: 'Mihisara Senarath', userId: String(pt.user._id) }));
    expect(res.status).toBe(201);
    expect(String(res.body.patient.registeredPatientId)).toBe(String(pt.user._id));
    const refreshed = await User.findById(pt.user._id);
    expect(String(refreshed.assignedCaregiverId)).toBe(String(cg.user._id));
  });

  test('IT-BE-27 the same registered patient cannot be added twice (409)', async () => {
    const cg = await createUser('caregiver');
    const pt = await createUser('patient');
    const body = patientBody({ userId: String(pt.user._id) });
    await request(app).post(base).set(auth(cg.token)).send(body);
    const again = await request(app).post(base).set(auth(cg.token)).send(body);
    expect(again.status).toBe(409);
    expect(again.body.message).toMatch(/already been added/i);
    expect(await Patient.countDocuments()).toBe(1);
  });

  test('IT-BE-28 a second caregiver also cannot add a patient already in the module (409)', async () => {
    const cg1 = await createUser('caregiver');
    const cg2 = await createUser('caregiver');
    const pt = await createUser('patient');
    await request(app).post(base).set(auth(cg1.token)).send(patientBody({ userId: String(pt.user._id) }));
    const res = await request(app).post(base).set(auth(cg2.token)).send(patientBody({ userId: String(pt.user._id) }));
    expect(res.status).toBe(409);
  });

  test('IT-BE-29 an invalid userId is rejected (400)', async () => {
    const cg = await createUser('caregiver');
    const res = await request(app).post(base).set(auth(cg.token)).send(patientBody({ userId: 'not-an-id' }));
    expect(res.status).toBe(400);
  });

  test('IT-BE-30 an unknown userId is rejected (404)', async () => {
    const cg = await createUser('caregiver');
    const res = await request(app).post(base).set(auth(cg.token)).send(patientBody({ userId: '64b000000000000000000000' }));
    expect(res.status).toBe(404);
  });

  test('IT-BE-31 dropdown list hides registered patients already added', async () => {
    const cg = await createUser('caregiver');
    const added = await createUser('patient', { fullName: 'Already Added' });
    await createUser('patient', { fullName: 'Still Free' });
    await request(app).post(base).set(auth(cg.token)).send(patientBody({ userId: String(added.user._id) }));

    const res = await request(app).get('/api/patients/registered').set(auth(cg.token));
    expect(res.status).toBe(200);
    const names = res.body.patients.map((p) => p.fullName);
    expect(names).toContain('Still Free');
    expect(names).not.toContain('Already Added');
  });

  test('IT-BE-32 deleting a patient from the module makes them selectable again', async () => {
    const cg = await createUser('caregiver');
    const pt = await createUser('patient', { fullName: 'Come Back' });
    const created = await request(app).post(base).set(auth(cg.token)).send(patientBody({ userId: String(pt.user._id) }));

    let list = await request(app).get('/api/patients/registered').set(auth(cg.token));
    expect(list.body.patients.map((p) => p.fullName)).not.toContain('Come Back');

    await request(app).delete(`${base}/${created.body.patient._id}`).set(auth(cg.token));
    list = await request(app).get('/api/patients/registered').set(auth(cg.token));
    expect(list.body.patients.map((p) => p.fullName)).toContain('Come Back');
    expect((await User.findById(pt.user._id)).assignedCaregiverId).toBeNull();
  });
});
