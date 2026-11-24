import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.JWT_SECRET = 'test-secret-value';
process.env.NODE_ENV = 'test';
process.env.DETECTION_TOKEN = 'test-service-token-value';
process.env.RATE_LIMIT_LOGIN = '80';
delete process.env.DETECTION_URL;
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;

const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri('helio_mobile_client');

const { default: app } = await import('../src/app.js');
const { default: User } = await import('../src/models/User.js');
const { default: Batch } = await import('../src/models/Batch.js');

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const MOBILE = { 'Content-Type': 'application/json', 'X-Pharmavision-Client': 'mobile' };

let server;
let base;

function authHeaders(token, extra = {}) {
  return { ...MOBILE, Authorization: `Bearer ${token}`, ...extra };
}

async function send(path, { method = 'GET', token = '', body, headers = {} } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(token ? authHeaders(token) : { ...MOBILE, ...headers }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = text;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

async function mobileLogin(email) {
  return send('/api/auth/login', { method: 'POST', headers: MOBILE, body: { email, password: 'correct-password' } });
}

before(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const passwordHash = await bcrypt.hash('correct-password', 10);
  await User.create([
    { name: 'Clinic admin', email: 'admin@helio.local', passwordHash, role: 'ADMIN', active: true },
    { name: 'Dr Lee', email: 'lee@helio.local', passwordHash, role: 'DOCTOR', active: true },
    { name: 'Stores', email: 'store@helio.local', passwordHash, role: 'INVENTORY_MANAGER', active: true },
    { name: 'Pharmacist', email: 'pharma@helio.local', passwordHash, role: 'PHARMACIST', active: true },
    { name: 'Security', email: 'security@helio.local', passwordHash, role: 'SECURITY_OFFICER', active: true },
  ]);
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  delete globalThis.helioDb;
  await mongoose.disconnect();
  await mongo.stop();
});

test('mobile login stores a session only for the mobile client and logout revokes it', async () => {
  const browser = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5175', 'X-Pharmavision-Client': 'mobile' },
    body: JSON.stringify({ email: 'admin@helio.local', password: 'correct-password' }),
  });
  const browserBody = await browser.json();
  assert.equal(browser.status, 200);
  assert.equal(browserBody.accessToken, undefined);
  assert.equal(browserBody.refreshToken, undefined);

  const wrong = await mobileLogin('admin@helio.local');
  assert.equal(wrong.status, 200);
  const bad = await send('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@helio.local', password: 'not-the-password' },
  });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.accessToken, undefined);

  const admin = await mobileLogin('admin@helio.local');
  assert.equal(admin.status, 200);
  assert.equal(typeof admin.body.accessToken, 'string');
  assert.equal(typeof admin.body.refreshToken, 'string');
  assert.equal(admin.body.user.passwordHash, undefined);
  assert.equal(admin.body.user.role, 'ADMIN');

  const me = await send('/api/auth/me', { token: admin.body.accessToken });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, 'admin@helio.local');

  const anonymous = await fetch(`${base}/api/shelves`);
  assert.equal(anonymous.status, 401);

  const loggedOut = await send('/api/auth/logout', {
    method: 'POST',
    token: admin.body.accessToken,
    headers: { 'X-Refresh-Token': admin.body.refreshToken },
  });
  assert.equal(loggedOut.status, 200);
  const refreshed = await send('/api/auth/refresh', {
    method: 'POST',
    headers: { 'X-Refresh-Token': admin.body.refreshToken },
  });
  assert.equal(refreshed.status, 401);

  const audit = await send('/api/audit?action=login', { token: (await mobileLogin('security@helio.local')).body.accessToken });
  assert.equal(audit.status, 200);
  assert.equal(audit.body.entries.some((entry) => entry.action === 'login'), true);
  const hidden = await send('/api/audit', { token: (await mobileLogin('store@helio.local')).body.accessToken });
  assert.equal(hidden.status, 403);
});

test('patient, doctor, inventory, medicine, shelf, scan, and alert calls follow the server roles', async () => {
  const doctor = (await mobileLogin('lee@helio.local')).body;
  const inventory = (await mobileLogin('store@helio.local')).body;
  const pharmacist = (await mobileLogin('pharma@helio.local')).body;
  const security = (await mobileLogin('security@helio.local')).body;
  const admin = (await mobileLogin('admin@helio.local')).body;

  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);

  const created = await send('/api/patients', {
    method: 'POST',
    token: doctor.accessToken,
    body: { name: 'Ada Patient', age: 34, address: '12 Clinic Road', allergies: ['Penicillin'] },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const patients = await send('/api/patients?q=Ada', { token: doctor.accessToken });
  assert.equal(patients.status, 200);
  assert.equal(patients.body.patients.some((patient) => patient.name === 'Ada Patient'), true);
  const deniedPatients = await send('/api/patients', { token: inventory.accessToken });
  assert.equal(deniedPatients.status, 403);

  const detail = await send(`/api/patients/${created.body._id}`, { token: security.accessToken });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.allergies, undefined);
  const clinical = await send(`/api/patients/${created.body._id}`, { token: doctor.accessToken });
  assert.deepEqual(clinical.body.allergies, ['Penicillin']);

  const doctors = await send('/api/doctors?q=Lee', { token: doctor.accessToken });
  assert.equal(doctors.status, 200);
  assert.equal(doctors.body.doctors.some((person) => person.name === 'Dr Lee'), true);
  assert.equal((await send('/api/doctors', { token: inventory.accessToken })).status, 403);

  const dashboard = await send('/api/dashboard', { token: admin.accessToken });
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.cards.patients >= 1, true);
  assert.equal((await send('/api/dashboard', { token: doctor.accessToken })).status, 403);
  const stats = await send('/api/stats', { token: doctor.accessToken });
  assert.equal(stats.status, 200);
  assert.equal(typeof stats.body.patients, 'number');

  const medicine = await send('/api/medicines', {
    method: 'POST',
    token: admin.accessToken,
    body: { name: 'Amoxicillin', form: 'Tablet', strength: '500mg' },
  });
  assert.equal(medicine.status, 201, JSON.stringify(medicine.body));
  const search = await send('/api/medicines?q=Amox', { token: doctor.accessToken });
  assert.equal(search.status, 200);
  assert.equal(search.body.some((item) => item.name === 'Amoxicillin'), true);
  assert.equal((await send('/api/medicines?q=Amox', { token: security.accessToken })).status, 403);

  const stock = await send('/api/inventory/stock', { token: pharmacist.accessToken });
  assert.equal(stock.status, 200);
  assert.ok(Array.isArray(stock.body.stock));
  assert.equal((await send('/api/inventory/stock', { token: doctor.accessToken })).status, 403);
  const warnings = await send('/api/inventory/alerts', { token: inventory.accessToken });
  assert.equal(warnings.status, 200);
  assert.ok(Array.isArray(warnings.body.lowStock));
  assert.ok(Array.isArray(warnings.body.expired));

  const shelf = await send('/api/shelves', {
    method: 'POST',
    token: inventory.accessToken,
    body: {
      name: 'Wall shelf',
      location: 'Dispensary west',
      sections: [{ code: 'A', name: 'Top' }],
      boundary: {
        unit: 'ratio',
        width: 0.64,
        height: 0.56,
        depth: 0,
        points: [
          { x: 0.18, y: 0.22, z: 0 },
          { x: 0.82, y: 0.22, z: 0 },
          { x: 0.82, y: 0.78, z: 0 },
          { x: 0.18, y: 0.78, z: 0 },
        ],
      },
      coordinateSystem: { name: 'image-normalized', handedness: 'right', up: 'y', unit: 'ratio', origin: { x: 0, y: 0, z: 0 } },
      calibration: { status: 'MANUAL', method: 'image-plane' },
      device: { platform: 'android', os: 'Android 14', model: 'phone', appVersion: '1.0.0' },
    },
  });
  assert.equal(shelf.status, 201, JSON.stringify(shelf.body));
  assert.equal(shelf.body.calibration.status, 'MANUAL');
  assert.equal((await send('/api/shelves', { method: 'POST', token: doctor.accessToken, body: { name: 'Nope', location: 'Room' } })).status, 403);

  const scan = await send('/api/scans', {
    method: 'POST',
    token: pharmacist.accessToken,
    body: {
      requestId: 'scn-mobile-integration',
      shelf: shelf.body._id,
      section: 'A',
      image: { mime: 'image/png', data: PNG },
      device: { platform: 'android', os: 'Android 14', model: 'phone', appVersion: '1.0.0' },
    },
  });
  assert.equal(scan.status, 201, JSON.stringify(scan.body));
  assert.equal(scan.body.status, 'RECEIVED');
  assert.match(scan.body.recognition.message, /not connected/);
  assert.match(scan.body.recognition.message, /Stock was not changed/);
  assert.equal(scan.body.image, undefined);
  assert.equal(scan.body.imageStored, true);
  assert.equal(scan.body.observations.length, 0);
  assert.equal(await Batch.countDocuments(), 0);
  const earlyReview = await send(`/api/scans/${scan.body._id}/review`, {
    method: 'POST',
    token: pharmacist.accessToken,
    body: { confirmed: true },
  });
  assert.equal(earlyReview.status, 400);
  assert.equal((await send('/api/scans', { method: 'POST', token: doctor.accessToken, body: { requestId: 'scn-denied-doctor', shelf: shelf.body._id, image: { mime: 'image/png', data: PNG } } })).status, 403);

  const alerts = await send('/api/alerts', { token: security.accessToken });
  assert.equal(alerts.status, 200);
  assert.ok(Array.isArray(alerts.body.alerts));
  assert.equal((await send('/api/alerts', { token: doctor.accessToken })).status, 403);
  assert.equal((await send('/api/alerts/not-an-id', { method: 'PATCH', token: pharmacist.accessToken, body: { status: 'DISMISSED' } })).status, 403);
});
