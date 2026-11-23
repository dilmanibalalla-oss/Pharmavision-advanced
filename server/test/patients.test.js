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
process.env.MONGODB_URI = mongo.getUri('helio_patients');

const { default: app } = await import('../src/app.js');
const { default: User } = await import('../src/models/User.js');
const { default: Patient } = await import('../src/models/Patient.js');
const { default: Medicine } = await import('../src/models/Medicine.js');

let server;
let base;
let adminCookie;
let securityCookie;
let pharmacistCookie;
let legacyId;

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

async function send(path, { method = 'GET', cookie = adminCookie, body } = {}) {
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

describe('patient management', { concurrency: 1 }, () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const passwordHash = await bcrypt.hash('correct-password', 10);
    await User.create([
      { name: 'Clinic admin', email: 'admin@helio.local', passwordHash, role: 'ADMIN', active: true },
      { name: 'Dr Lee', email: 'lee@helio.local', passwordHash, role: 'DOCTOR', active: true },
      { name: 'Safety lead', email: 'safety@helio.local', passwordHash, role: 'SECURITY_OFFICER', active: true },
      { name: 'Dispenser', email: 'pharmacy@helio.local', passwordHash, role: 'PHARMACIST', active: true },
      { name: 'Store lead', email: 'store@helio.local', passwordHash, role: 'INVENTORY_MANAGER', active: true },
    ]);
    const medicine = await Medicine.create({ name: 'Dated tablets', strength: '10 mg', form: 'Tablet' });
    const legacy = await Patient.create({
      name: 'Ada Fern',
      age: 40,
      address: '1 Road',
      allergies: ['Penicillin'],
      visitCount: 1,
      visits: [{
        visitedAt: new Date('2026-11-01T09:00:00Z'),
        treatments: [{
          medicine: medicine._id,
          medicineName: medicine.name,
          strength: medicine.strength,
          form: medicine.form,
          notes: 'After food',
          recordedAt: new Date('2026-11-01T09:05:00Z'),
        }],
      }],
    });
    legacyId = String(legacy._id);
    server = app.listen(0);
    base = `http://127.0.0.1:${server.address().port}`;
    adminCookie = await login('admin@helio.local');
    securityCookie = await login('safety@helio.local');
    pharmacistCookie = await login('pharmacy@helio.local');
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    delete globalThis.helioDb;
    await mongoose.disconnect();
    await mongo.stop();
  });

  test('keeps an existing chart and gives it a patient id', async () => {
    const listed = await send('/api/patients?q=Ada%20Fern', { cookie: securityCookie });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.total, 1);
    assert.equal(listed.body.patients[0].name, 'Ada Fern');
    assert.match(listed.body.patients[0].patientCode, /^PT-\d{6}$/);
    assert.equal(JSON.stringify(listed.body).includes('Penicillin'), false);

    const profile = await send(`/api/patients/${legacyId}`);
    assert.equal(profile.body.allergies[0], 'Penicillin');
    assert.equal(profile.body.consultations.length, 1);
    assert.equal(profile.body.treatments[0].medicineName, 'Dated tablets');
    assert.equal(profile.body.prescriptions[0].notes, 'After food');
    assert.equal(profile.body.visitCount, 1);

    const legacyCreate = await send('/api/patients', {
      method: 'POST',
      body: { name: 'Ada', age: 40, address: '1 Road' },
    });
    assert.equal(legacyCreate.status, 201);
    assert.equal(legacyCreate.body.name, 'Ada');
    assert.match(legacyCreate.body.patientCode, /^PT-\d{6}$/);
  });

  test('registers, searches, filters, edits, and keeps the consultation', async () => {
    const created = await send('/api/patients', {
      method: 'POST',
      body: {
        name: 'Nimal Perera',
        dateOfBirth: '1990-04-02',
        gender: 'Male',
        phone: '0112550000',
        email: 'nimal.patient@helio.local',
        address: '12 Ward Place',
        emergencyContact: { name: 'Sita Perera', phone: '0112550001', relationship: 'Spouse' },
        bloodGroup: 'O+',
        allergies: ['Peanuts', 'peanuts'],
        conditions: ['Asthma'],
      },
    });
    assert.equal(created.status, 201);
    const { parseDateOfBirth } = await import('../src/validate.js');
    assert.equal(created.body.age, parseDateOfBirth('1990-04-02').age);
    assert.deepEqual(created.body.allergies, ['Peanuts']);
    assert.equal(created.body.active, true);
    const id = created.body._id;

    const byPhone = await send('/api/patients?q=0112550000&gender=Male&active=true&bloodGroup=O%2B');
    assert.equal(byPhone.body.patients.some((patient) => patient._id === id), true);

    const byCode = await send(`/api/patients?q=${created.body.patientCode}`);
    assert.equal(byCode.body.total, 1);

    const edited = await send(`/api/patients/${id}`, {
      method: 'PUT',
      body: {
        name: 'Nimal Perera',
        dateOfBirth: '1990-04-02',
        phone: '0112999999',
        address: '12 Ward Place',
        allergies: ['Peanuts'],
        conditions: ['Asthma', 'Hypertension'],
      },
    });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.phone, '0112999999');
    assert.deepEqual(edited.body.conditions, ['Asthma', 'Hypertension']);
    assert.equal(edited.body.visitCount, 0);

    const page = await send('/api/patients?limit=1&page=1');
    assert.equal(page.body.patients.length, 1);
    assert.ok(page.body.pages >= 2);

    const visit = await send(`/api/patients/${id}/visit`, { method: 'POST', body: {} });
    assert.equal(visit.status, 200);
    assert.equal(visit.body.visitCount, 1);

    const inactive = await send(`/api/patients/${id}/active`, { method: 'PATCH', body: { active: false } });
    assert.equal(inactive.body.active, false);
    const blocked = await send(`/api/patients/${id}/visit`, { method: 'POST', body: {} });
    assert.equal(blocked.status, 400);
    const still = await Patient.findById(id);
    assert.equal(still.visits.length, 1);
    assert.equal(still.address, '12 Ward Place');
  });

  test('hides medical details from roles outside the clinical team', async () => {
    const hidden = await send(`/api/patients/${legacyId}`, { cookie: securityCookie });
    assert.equal(hidden.status, 200);
    assert.equal(hidden.body.name, 'Ada Fern');
    assert.equal(hidden.body.allergies, undefined);
    assert.equal(hidden.body.conditions, undefined);
    assert.equal(hidden.body.bloodGroup, undefined);
    assert.equal(hidden.body.consultations, undefined);
    assert.equal(JSON.stringify(hidden.body).includes('Penicillin'), false);
    assert.equal(JSON.stringify(hidden.body).includes('Dated tablets'), false);

    const history = await send(`/api/patients/${legacyId}/prescriptions`, { cookie: securityCookie });
    assert.equal(history.status, 403);

    const pharmacy = await send(`/api/patients/${legacyId}/treatments`, { cookie: pharmacistCookie });
    assert.equal(pharmacy.status, 200);
    assert.equal(pharmacy.body.treatments[0].medicineName, 'Dated tablets');

    const store = await send('/api/patients', { cookie: await login('store@helio.local') });
    assert.equal(store.status, 403);

    const future = await send('/api/patients', {
      method: 'POST',
      body: { name: 'Future Child', dateOfBirth: '2999-01-01', address: '1 Road' },
    });
    assert.equal(future.status, 400);
  });
});
