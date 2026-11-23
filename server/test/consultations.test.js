import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.JWT_SECRET = 'test-secret-value';
process.env.NODE_ENV = 'test';
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;

const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri('helio_consultations');

const { default: app } = await import('../src/app.js');
const { default: User } = await import('../src/models/User.js');
const { default: Patient } = await import('../src/models/Patient.js');

let server;
let base;
let adminCookie;
let doctorCookie;
let otherCookie;
let pharmacistCookie;
let patientId;
let otherDoctorId;

function cookieHeader(response) {
  const rows = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  return rows.map((row) => row.split(';')[0]).join('; ');
}

async function login(email) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct-password' }),
  });
  return cookieHeader(response);
}

async function send(path, { method = 'GET', cookie = doctorCookie, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  return { status: response.status, body: payload };
}

describe('consultations', { concurrency: 1 }, () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const passwordHash = await bcrypt.hash('correct-password', 10);
    const [admin, doctor, other, pharmacist] = await User.create([
      { name: 'Clinic admin', email: 'admin@helio.local', passwordHash, role: 'ADMIN', active: true },
      { name: 'Dr Lee', email: 'lee@helio.local', passwordHash, role: 'DOCTOR', active: true },
      { name: 'Dr Owen', email: 'owen@helio.local', passwordHash, role: 'DOCTOR', active: true },
      { name: 'Dispenser', email: 'pharmacy@helio.local', passwordHash, role: 'PHARMACIST', active: true },
    ]);
    otherDoctorId = String(other._id);
    const patient = await Patient.create({
      name: 'Nimal Perera',
      age: 36,
      address: '12 Ward Place',
      patientCode: 'PT-000021',
      active: true,
    });
    patientId = String(patient._id);
    await Patient.create({ name: 'Closed chart', age: 50, address: '2 Road', active: false });
    server = app.listen(0);
    base = `http://127.0.0.1:${server.address().port}`;
    adminCookie = await login('admin@helio.local');
    doctorCookie = await login('lee@helio.local');
    otherCookie = await login('owen@helio.local');
    pharmacistCookie = await login('pharmacy@helio.local');
    assert.ok(admin._id);
    assert.ok(doctor._id);
    assert.ok(pharmacist._id);
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    delete globalThis.helioDb;
    await mongoose.disconnect();
    await mongo.stop();
  });

  test('records a consultation for a patient and doctor and keeps an audit', async () => {
    const created = await send('/api/consultations', {
      method: 'POST',
      body: {
        patient: patientId,
        doctor: otherDoctorId,
        consultedAt: '2026-11-23T09:30:00.000Z',
        chiefComplaint: 'Sore throat for two days',
        symptoms: 'Pain on swallowing',
        medicalHistory: 'Asthma',
        examination: 'Red throat',
        vitals: { systolic: 120, diastolic: 80, temperature: 37.4 },
        diagnosis: 'Pharyngitis',
        investigations: ['Throat swab'],
        notes: 'Review if fever continues',
        followUp: 'Return in three days',
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.doctorName, 'Dr Lee');
    assert.equal(created.body.patientCode, 'PT-000021');
    assert.equal(created.body.diagnosis, 'Pharyngitis');
    assert.equal(created.body.audit[0].action, 'created');
    assert.equal(created.body.audit[0].name, 'Dr Lee');
    const id = created.body._id;

    const updated = await send(`/api/consultations/${id}`, {
      method: 'PUT',
      body: {
        patient: patientId,
        consultedAt: '2026-11-23T09:30:00.000Z',
        chiefComplaint: 'Sore throat for two days',
        diagnosis: 'Viral pharyngitis',
        vitals: { systolic: 120, diastolic: 80, temperature: 37.4 },
        investigations: ['Throat swab'],
      },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.diagnosis, 'Viral pharyngitis');
    assert.equal(updated.body.symptoms, 'Pain on swallowing');
    assert.equal(updated.body.audit.at(-1).action, 'updated');
    assert.deepEqual(updated.body.audit.at(-1).fields, ['diagnosis']);

    const history = await send(`/api/consultations?patient=${patientId}&q=throat`);
    assert.equal(history.body.total, 1);
    assert.equal(history.body.consultations[0]._id, id);

    const denied = await send(`/api/consultations/${id}`, {
      method: 'PUT',
      cookie: otherCookie,
      body: {
        patient: patientId,
        consultedAt: '2026-11-23T09:30:00.000Z',
        chiefComplaint: 'Changed by someone else',
      },
    });
    assert.equal(denied.status, 403);
    const unchanged = await send(`/api/consultations/${id}`);
    assert.equal(unchanged.body.chiefComplaint, 'Sore throat for two days');

    const hidden = await send('/api/consultations', { cookie: pharmacistCookie });
    assert.equal(hidden.status, 403);

    const closed = await Patient.findOne({ name: 'Closed chart' });
    const blocked = await send('/api/consultations', {
      method: 'POST',
      body: {
        patient: String(closed._id),
        consultedAt: '2026-11-23T10:00:00.000Z',
        chiefComplaint: 'Should not open',
      },
    });
    assert.equal(blocked.status, 400);
  });
});
