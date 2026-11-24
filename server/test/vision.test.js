import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.JWT_SECRET = 'test-secret-value';
process.env.NODE_ENV = 'test';
process.env.DETECTION_TOKEN = 'test-service-token-value';
process.env.RATE_LIMIT_LOGIN = '40';
delete process.env.DETECTION_URL;
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;

const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri('helio_vision');

const { default: app } = await import('../src/app.js');
const { default: User } = await import('../src/models/User.js');
const { default: Batch } = await import('../src/models/Batch.js');

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let server;
let base;
let adminCookie;
let doctorCookie;
let pharmacistCookie;
let securityCookie;
let inventoryCookie;

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

async function send(path, { method = 'GET', cookie = adminCookie, body, headers = {} } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = response.headers.get('content-type') || '';
  const payload = type.includes('json') ? await response.json() : await response.text();
  return { status: response.status, body: payload, headers: response.headers };
}

describe('vision, reports and security', { concurrency: 1 }, () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const passwordHash = await bcrypt.hash('correct-password', 10);
    await User.create([
      { name: 'Clinic admin', email: 'admin@helio.local', passwordHash, role: 'ADMIN', active: true },
      { name: 'Pharma', email: 'pharmacy@helio.local', passwordHash, role: 'PHARMACIST', active: true },
      { name: 'Dr Lee', email: 'lee@helio.local', passwordHash, role: 'DOCTOR', active: true },
      { name: 'Stores', email: 'stores@helio.local', passwordHash, role: 'INVENTORY_MANAGER', active: true },
      { name: 'Guard', email: 'guard@helio.local', passwordHash, role: 'SECURITY_OFFICER', active: true },
    ]);
    server = app.listen(0);
    base = `http://127.0.0.1:${server.address().port}`;
    adminCookie = await login('admin@helio.local');
    pharmacistCookie = await login('pharmacy@helio.local');
    doctorCookie = await login('lee@helio.local');
    inventoryCookie = await login('stores@helio.local');
    securityCookie = await login('guard@helio.local');
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    delete globalThis.helioDb;
    await mongoose.disconnect();
    await mongo.stop();
  });

  test('blocks anonymous access, bad origins, operator payloads and privilege changes', async () => {
    const health = await send('/api/health', { cookie: '' });
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(health.headers.get('x-powered-by'), null);

    const shelves = await send('/api/shelves', { cookie: '' });
    assert.equal(shelves.status, 401);

    const origin = await fetch(`${base}/api/health`, { headers: { Origin: 'https://evil.example' } });
    assert.equal(origin.status, 403);

    const injected = await send('/api/auth/login', {
      cookie: '',
      method: 'POST',
      body: { email: { $gt: '' }, password: 'correct-password' },
    });
    assert.equal(injected.status, 400);

    const shelfDenied = await send('/api/shelves', {
      method: 'POST',
      cookie: doctorCookie,
      body: { name: 'Aisle', location: 'Room' },
    });
    assert.equal(shelfDenied.status, 403);

    const users = await send('/api/users');
    const pharmacist = users.body.find((user) => user.email === 'pharmacy@helio.local');
    const escalation = await send(`/api/users/${pharmacist._id}/role`, {
      method: 'PATCH',
      cookie: pharmacistCookie,
      body: { role: 'ADMIN' },
    });
    assert.equal(escalation.status, 403);

    const clinical = await send('/api/reports/consultations', { cookie: securityCookie });
    assert.equal(clinical.status, 403);
    const auditDenied = await send('/api/audit', { cookie: doctorCookie });
    assert.equal(auditDenied.status, 403);
  });

  test('stores shelf scans as observations and does not change stock', async () => {
    const medicine = await send('/api/medicines', {
      method: 'POST',
      body: { brandName: 'Shelfcillin', strength: '100 mg', form: 'Tablet', minimumStock: 2 },
    });
    assert.equal(medicine.status, 201, JSON.stringify(medicine.body));
    const shelf = await send('/api/shelves', {
      method: 'POST',
      body: {
        name: 'Aisle 1',
        location: 'Dispensary',
        sections: [{ code: 'A', name: 'Top', medicines: [medicine.body._id] }],
        boundary: { unit: 'm', width: 1, height: 2, depth: 0.4, points: [{ x: 0, y: 0, z: 0 }] },
      },
    });
    assert.equal(shelf.status, 201, JSON.stringify(shelf.body));
    assert.match(shelf.body.shelfCode, /^SHF-/);
    assert.equal(shelf.body.flutter.shelfId, shelf.body.shelfCode);

    const badImage = await send('/api/scans', {
      method: 'POST',
      body: { requestId: 'scan-bad-image-01', shelf: shelf.body._id, image: { mime: 'image/png', data: 'aaaa' } },
    });
    assert.equal(badImage.status, 400);

    const scan = await send('/api/scans', {
      method: 'POST',
      body: {
        requestId: 'scan-good-image-01',
        shelf: shelf.body._id,
        section: 'A',
        image: { mime: 'image/png', data: PNG },
        device: { platform: 'web', model: 'browser' },
      },
    });
    assert.equal(scan.status, 201, JSON.stringify(scan.body));
    assert.equal(scan.body.recognition.performed, false);
    assert.match(scan.body.recognition.message, /not connected/i);
    assert.equal(scan.body.observations.length, 0);
    assert.equal(await Batch.countDocuments(), 0);

    const unauthorized = await send(`/api/scans/${scan.body._id}/results`, {
      method: 'POST',
      cookie: '',
      body: { observations: [] },
    });
    assert.equal(unauthorized.status, 401);

    const results = await send(`/api/scans/${scan.body._id}/results`, {
      method: 'POST',
      cookie: '',
      headers: { 'X-Service-Token': process.env.DETECTION_TOKEN },
      body: {
        observations: [
          { medicineId: medicine.body._id, count: 2, confidence: 0.91, section: 'A' },
          { medicineId: medicine.body._id, count: 9, confidence: 0.2, section: 'A' },
          { label: 'Blurred box', count: 1, confidence: 0.95 },
        ],
      },
    });
    assert.equal(results.status, 200, JSON.stringify(results.body));
    assert.equal(results.body.stockChanged, false);
    assert.equal(results.body.scan.recognition.performed, true);
    assert.equal(results.body.scan.observations[1].lowConfidence, true);
    assert.equal(results.body.scan.observations[2].unknown, true);
    assert.equal(await Batch.countDocuments(), 0);
    const text = JSON.stringify(results.body);
    assert.equal(text.includes('theft'), false);
    assert.equal(text.includes('accused'), false);

    const alerts = await send('/api/alerts');
    assert.equal(alerts.status, 200);
    const alert = alerts.body.alerts.find((item) => item.medicineName === 'Shelfcillin');
    assert.ok(alert);
    assert.equal(alert.expectedQuantity, 0);
    assert.equal(alert.observedQuantity, 2);
    assert.match(alert.statement, /not a finding about any employee/);

    const earlyClose = await send(`/api/alerts/${alert._id}`, {
      method: 'PATCH',
      body: { status: 'RESOLVED', resolution: 'Checked the shelf and the count was a camera angle.' },
    });
    assert.equal(earlyClose.status, 400);

    const inventoryClose = await send(`/api/alerts/${alert._id}`, {
      method: 'PATCH',
      cookie: inventoryCookie,
      body: { status: 'UNDER_REVIEW', investigator: securityCookie && undefined },
    });
    assert.equal(inventoryClose.status, 403);

    const users = await send('/api/users');
    const guard = users.body.find((user) => user.email === 'guard@helio.local');
    const review = await send(`/api/alerts/${alert._id}`, {
      method: 'PATCH',
      body: { status: 'UNDER_REVIEW', investigator: guard._id },
    });
    assert.equal(review.status, 200, JSON.stringify(review.body));
    const resolved = await send(`/api/alerts/${alert._id}`, {
      method: 'PATCH',
      body: { status: 'RESOLVED', resolution: 'The count was a low camera angle and stock was recounted by hand.' },
    });
    assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
    assert.equal(resolved.body.status, 'RESOLVED');

    const reviewed = await send(`/api/scans/${scan.body._id}/review`, {
      method: 'POST',
      body: { confirmed: true, note: 'Reviewed the photo. These counts stay observations.' },
    });
    assert.equal(reviewed.status, 200, JSON.stringify(reviewed.body));
    assert.equal(reviewed.body.stockChanged, false);
    assert.equal(reviewed.body.review.status, 'CONFIRMED');
    assert.equal(reviewed.body.observations.length, 3);
    assert.equal(await Batch.countDocuments(), 0);

    const unconfirmed = await send(`/api/scans/${scan.body._id}/review`, {
      method: 'POST',
      cookie: pharmacistCookie,
      body: { confirmed: false },
    });
    assert.equal(unconfirmed.status, 400);

    const doctorReview = await send(`/api/scans/${scan.body._id}/review`, {
      method: 'POST',
      cookie: doctorCookie,
      body: { confirmed: true, note: 'Should not be allowed' },
    });
    assert.equal(doctorReview.status, 403);

    const detail = await send(`/api/shelves/${shelf.body._id}`);
    assert.ok(detail.body.lastScanAt);
    assert.equal(detail.body.scans.length, 1);

    const registered = await send('/api/shelves', {
      method: 'POST',
      cookie: inventoryCookie,
      body: {
        name: 'Wall shelf',
        location: 'Dispensary west',
        sections: [
          { code: 'A', name: 'Top' },
          { code: 'B', name: 'Bottom' },
        ],
        boundary: {
          unit: 'ratio',
          width: 0.62,
          height: 0.41,
          depth: 0,
          points: [
            { x: 0.12, y: 0.18, z: 0 },
            { x: 0.74, y: 0.18, z: 0 },
            { x: 0.74, y: 0.59, z: 0 },
            { x: 0.12, y: 0.59, z: 0 },
          ],
        },
        coordinateSystem: {
          name: 'image-normalized',
          handedness: 'right',
          up: 'y',
          unit: 'ratio',
          origin: { x: 0, y: 0, z: 0 },
        },
        calibration: { status: 'MANUAL', method: 'image-plane' },
        device: { platform: 'android', os: 'Android 14', model: 'phone', appVersion: '1.0.0' },
      },
    });
    assert.equal(registered.status, 201, JSON.stringify(registered.body));
    assert.equal(registered.body.calibration.status, 'MANUAL');
    assert.equal(registered.body.calibration.method, 'image-plane');
    assert.equal(registered.body.boundary.points.length, 4);
    assert.equal(registered.body.sections.length, 2);
    assert.equal(registered.body.createdByName, 'Stores');
    assert.equal(registered.body.device.platform, 'android');

    const badCalibration = await send('/api/shelves', {
      method: 'POST',
      body: { name: 'Bad shelf', location: 'Room', calibration: { status: 'GUILTY' } },
    });
    assert.equal(badCalibration.status, 400);
  });

  test('exports reports from stored records without contact details', async () => {
    const phone = '9001112223';
    const created = await send('/api/patients', {
      method: 'POST',
      body: {
        name: 'Report Patient',
        dateOfBirth: '1991-02-02',
        gender: 'Female',
        phone,
        email: 'report.patient@helio.local',
        address: '9 Private Lane',
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const csv = await send('/api/reports/patients/export?format=csv&from=2026-01-01&to=2026-12-31');
    assert.equal(csv.status, 200);
    assert.equal(String(csv.body).includes(phone), false);
    assert.equal(String(csv.body).includes('report.patient@helio.local'), false);
    assert.equal(String(csv.body).includes('9 Private Lane'), false);
    assert.equal(String(csv.body).includes(created.body.patientCode), true);

    const pdf = await send('/api/reports/patients/export?format=pdf&from=2026-01-01&to=2026-12-31');
    assert.equal(pdf.status, 200);
    assert.equal(String(pdf.body).startsWith('%PDF'), true);
    assert.equal(String(pdf.body).includes(phone), false);

    const audit = await send('/api/audit?action=login');
    assert.equal(audit.status, 200);
    assert.ok(audit.body.entries.some((entry) => entry.action === 'login'));
    assert.equal(JSON.stringify(audit.body).includes('correct-password'), false);
  });

  test('rate limits repeated sign-in attempts', async () => {
    let limited = 0;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const response = await send('/api/auth/login', {
        method: 'POST',
        cookie: '',
        body: { email: 'admin@helio.local', password: 'wrong-password' },
      });
      if (response.status === 429) limited += 1;
    }
    assert.ok(limited > 0);
  });
});
