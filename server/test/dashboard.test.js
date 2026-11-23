import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.JWT_SECRET = 'test-secret-value';
process.env.NODE_ENV = 'test';
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;

const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri('helio_dashboard');

const { default: app } = await import('../src/app.js');
const { default: User } = await import('../src/models/User.js');
const { default: Patient } = await import('../src/models/Patient.js');
const { default: Medicine } = await import('../src/models/Medicine.js');

let server;
let base;

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

before(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const passwordHash = await bcrypt.hash('correct-password', 10);
  await User.create([
    { name: 'Clinic admin', email: 'admin@helio.local', passwordHash, role: 'ADMIN', active: true },
    { name: 'Dr Lee', email: 'lee@helio.local', passwordHash, role: 'DOCTOR', active: true },
    { name: 'Dr Away', email: 'away@helio.local', passwordHash, role: 'DOCTOR', active: false },
  ]);
  const medicine = await Medicine.create({
    name: 'Dated tablets',
    strength: '10 mg',
    form: 'Tablet',
    quantity: 4,
    unitCost: 2.5,
    reorderLevel: 5,
    expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
  });
  await Patient.create({
    name: 'Ada',
    age: 40,
    address: '1 Road',
    visitCount: 1,
    visits: [{
      visitedAt: new Date(),
      treatments: [{
        medicine: medicine._id,
        medicineName: medicine.name,
        strength: medicine.strength,
        form: medicine.form,
        recordedAt: new Date(),
      }],
    }],
  });
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  delete globalThis.helioDb;
  await mongoose.disconnect();
  await mongo.stop();
});

test('dashboard counts stored records and leaves missing stock figures unset', async () => {
  const admin = await login('admin@helio.local');
  const response = await fetch(`${base}/api/dashboard`, { headers: { Cookie: admin } });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.cards.doctors, 1);
  assert.equal(body.cards.patients, 1);
  assert.equal(body.cards.consultations, 1);
  assert.equal(body.cards.prescriptions, 1);
  assert.equal(body.cards.suppliers, 0);
  assert.equal(body.cards.pendingAlerts, 0);
  assert.equal(body.cards.stockValue, 10);
  assert.equal(body.cards.lowStock, 1);
  assert.equal(body.cards.expiring, 1);
  assert.equal(body.recentPatients[0].name, 'Ada');
  assert.equal(body.recentConsultations[0].treatmentCount, 1);
  assert.equal(body.lowStock[0].name, 'Dated tablets');
  assert.equal(body.stockMovements.length, 0);
  assert.equal(body.investigations.length, 0);
  assert.equal(body.consultationActivity.length, 14);
  assert.equal(body.consultationActivity.reduce((sum, point) => sum + point.count, 0), 1);
  assert.equal(JSON.stringify(body).includes('passwordHash'), false);
});

test('a doctor cannot open the administrator dashboard', async () => {
  const doctor = await login('lee@helio.local');
  const response = await fetch(`${base}/api/dashboard`, { headers: { Cookie: doctor } });
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.message, 'You do not have access to that');
});
