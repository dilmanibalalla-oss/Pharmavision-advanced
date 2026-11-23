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
process.env.MONGODB_URI = mongo.getUri('helio_treatment_plans');

const { default: app } = await import('../src/app.js');
const { default: User } = await import('../src/models/User.js');
const { default: Patient } = await import('../src/models/Patient.js');

let server;
let base;
let doctorCookie;
let otherCookie;
let pharmacistCookie;
let patientId;
let otherPatientId;
let closedId;
let lineId;
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

function planBody(extra = {}) {
  return {
    patient: patientId,
    doctor: otherDoctorId,
    diagnosis: 'Pharyngitis',
    description: 'Rest and fluids for five days',
    instructions: 'Return if swallowing worsens',
    startDate: '2026-11-23',
    endDate: '2026-11-28',
    status: 'PLANNED',
    ...extra,
  };
}

describe('treatment plans', { concurrency: 1 }, () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const passwordHash = await bcrypt.hash('correct-password', 10);
    const [, doctor, other, pharmacist] = await User.create([
      { name: 'Clinic admin', email: 'admin@helio.local', passwordHash, role: 'ADMIN', active: true },
      { name: 'Dr Lee', email: 'lee@helio.local', passwordHash, role: 'DOCTOR', active: true },
      { name: 'Dr Owen', email: 'owen@helio.local', passwordHash, role: 'DOCTOR', active: true },
      { name: 'Dispenser', email: 'pharmacy@helio.local', passwordHash, role: 'PHARMACIST', active: true },
    ]);
    otherDoctorId = String(other._id);
    lineId = new mongoose.Types.ObjectId();
    const patient = await Patient.create({
      name: 'Nimal Perera',
      age: 36,
      address: '12 Ward Place',
      patientCode: 'PT-000021',
      active: true,
      visits: [{
        visitedAt: new Date('2026-11-20T09:00:00.000Z'),
        treatments: [{
          _id: lineId,
          medicine: new mongoose.Types.ObjectId(),
          medicineName: 'Amoxicillin',
          strength: '500 mg',
          form: 'Capsule',
          notes: 'After food',
        }],
      }],
    });
    patientId = String(patient._id);
    const otherPatient = await Patient.create({ name: 'Other chart', age: 40, address: '9 Road', active: true });
    otherPatientId = String(otherPatient._id);
    const closed = await Patient.create({ name: 'Closed chart', age: 50, address: '2 Road', active: false });
    closedId = String(closed._id);
    server = app.listen(0);
    base = `http://127.0.0.1:${server.address().port}`;
    doctorCookie = await login('lee@helio.local');
    otherCookie = await login('owen@helio.local');
    pharmacistCookie = await login('pharmacy@helio.local');
    assert.ok(doctor._id);
    assert.ok(pharmacist._id);
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    delete globalThis.helioDb;
    await mongoose.disconnect();
    await mongo.stop();
  });

  test('keeps a treatment plan separate from the prescription it links', async () => {
    const consultation = await send('/api/consultations', {
      method: 'POST',
      body: {
        patient: patientId,
        consultedAt: '2026-11-23T09:30:00.000Z',
        chiefComplaint: 'Sore throat for two days',
        diagnosis: 'Pharyngitis',
      },
    });
    assert.equal(consultation.status, 201);

    const created = await send('/api/treatment-plans', {
      method: 'POST',
      body: planBody({
        consultation: consultation.body._id,
        prescriptions: [String(lineId)],
      }),
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.doctorName, 'Dr Lee');
    assert.equal(created.body.patientCode, 'PT-000021');
    assert.equal(created.body.diagnosis, 'Pharyngitis');
    assert.equal(created.body.status, 'PLANNED');
    assert.equal(String(created.body.consultation), consultation.body._id);
    assert.equal(created.body.prescriptions[0].medicineName, 'Amoxicillin');
    assert.equal(created.body.progress[0].note, 'Plan created');
    assert.equal(created.body.audit[0].action, 'created');
    const id = created.body._id;

    const chart = await Patient.findById(patientId);
    assert.equal(chart.visits[0].treatments[0].notes, 'After food');
    assert.equal(chart.visits[0].treatments[0].medicineName, 'Amoxicillin');

    const pharmacy = await send(`/api/patients/${patientId}/prescriptions`, { cookie: pharmacistCookie });
    assert.equal(pharmacy.status, 200);
    assert.equal(pharmacy.body.prescriptions[0].medicineName, 'Amoxicillin');

    const updated = await send(`/api/treatment-plans/${id}`, {
      method: 'PUT',
      body: { instructions: 'Return sooner if fever starts' },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.instructions, 'Return sooner if fever starts');
    assert.equal(updated.body.diagnosis, 'Pharyngitis');
    assert.equal(updated.body.description, 'Rest and fluids for five days');
    assert.equal(updated.body.prescriptions[0].medicineName, 'Amoxicillin');
    assert.deepEqual(updated.body.audit.at(-1).fields, ['instructions']);

    const progress = await send(`/api/treatment-plans/${id}/progress`, {
      method: 'POST',
      body: { note: 'Swallowing is easier', status: 'ACTIVE' },
    });
    assert.equal(progress.status, 200);
    assert.equal(progress.body.status, 'ACTIVE');
    assert.equal(progress.body.progress.at(-1).kind, 'progress');
    assert.equal(progress.body.progress.at(-1).note, 'Swallowing is easier');

    const follow = await send(`/api/treatment-plans/${id}/follow-up`, {
      method: 'POST',
      body: { followUpDate: '2026-11-30', note: 'Review the throat' },
    });
    assert.equal(follow.status, 200);
    assert.equal(String(follow.body.followUpDate).slice(0, 10), '2026-11-30');
    assert.equal(follow.body.progress.at(-1).kind, 'follow-up');

    const active = await send('/api/treatment-plans?status=ACTIVE&q=pharyngitis');
    assert.equal(active.status, 200);
    assert.equal(active.body.total, 1);
    assert.equal(active.body.treatmentPlans[0]._id, id);

    const completed = await send('/api/treatment-plans?status=COMPLETED');
    assert.equal(completed.body.total, 0);

    const refused = await send(`/api/treatment-plans/${id}`, {
      method: 'PUT',
      cookie: otherCookie,
      body: { description: 'A different plan' },
    });
    assert.equal(refused.status, 403);
    const still = await send(`/api/treatment-plans/${id}`, { cookie: otherCookie });
    assert.equal(still.status, 200);
    assert.equal(still.body.description, 'Rest and fluids for five days');

    const hidden = await send('/api/treatment-plans', { cookie: pharmacistCookie });
    assert.equal(hidden.status, 403);
  });

  test('rejects a plan that would mix charts or skip the description', async () => {
    const otherConsult = await send('/api/consultations', {
      method: 'POST',
      body: {
        patient: otherPatientId,
        consultedAt: '2026-11-23T10:00:00.000Z',
        chiefComplaint: 'Headache',
      },
    });
    assert.equal(otherConsult.status, 201);

    const wrongChart = await send('/api/treatment-plans', {
      method: 'POST',
      body: planBody({ consultation: otherConsult.body._id }),
    });
    assert.equal(wrongChart.status, 400);
    assert.match(wrongChart.body.message, /different patient/);

    const missingLine = await send('/api/treatment-plans', {
      method: 'POST',
      body: planBody({ prescriptions: [String(new mongoose.Types.ObjectId())] }),
    });
    assert.equal(missingLine.status, 400);
    assert.match(missingLine.body.message, /not on this patient chart/);

    const dates = await send('/api/treatment-plans', {
      method: 'POST',
      body: planBody({ endDate: '2026-11-01' }),
    });
    assert.equal(dates.status, 400);
    assert.match(dates.body.message, /End date/);

    const closed = await send('/api/treatment-plans', {
      method: 'POST',
      body: planBody({ patient: closedId }),
    });
    assert.equal(closed.status, 400);
    assert.match(closed.body.message, /inactive/);

    const empty = await send('/api/treatment-plans', {
      method: 'POST',
      body: planBody({ description: '   ' }),
    });
    assert.equal(empty.status, 400);
    assert.match(empty.body.message, /description/i);
  });

  test('shows treatment history apart from prescriptions, and follow-ups that are due', async () => {
    const later = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const due = await send('/api/treatment-plans', {
      method: 'POST',
      body: planBody({
        diagnosis: 'Due review',
        description: 'Check the throat again',
        startDate: '2020-06-01',
        endDate: null,
        followUpDate: '2020-06-01',
        status: 'ACTIVE',
        prescriptions: [String(lineId)],
      }),
    });
    assert.equal(due.status, 201);

    const laterPlan = await send('/api/treatment-plans', {
      method: 'POST',
      body: planBody({
        diagnosis: 'Later review',
        description: 'Review next week',
        startDate: later,
        endDate: null,
        followUpDate: later,
        status: 'PLANNED',
      }),
    });
    assert.equal(laterPlan.status, 201);

    const finished = await send('/api/treatment-plans', {
      method: 'POST',
      body: planBody({
        diagnosis: 'Finished course',
        description: 'Course finished',
        startDate: '2020-06-01',
        endDate: '2020-06-15',
        followUpDate: null,
        status: 'COMPLETED',
      }),
    });
    assert.equal(finished.status, 201);

    const dueList = await send('/api/treatment-plans?due=true&q=Due%20review');
    assert.equal(dueList.status, 200);
    assert.equal(dueList.body.total, 1);
    assert.equal(dueList.body.treatmentPlans[0]._id, due.body._id);

    const notDue = await send('/api/treatment-plans?due=true&q=Later%20review');
    assert.equal(notDue.body.total, 0);

    const overview = await send('/api/treatment-plans/overview?q=Finished%20course');
    assert.equal(overview.status, 200);
    assert.equal(overview.body.completed.total, 1);
    assert.equal(overview.body.active.total, 0);
    assert.equal(overview.body.completed.treatmentPlans[0].diagnosis, 'Finished course');
    assert.equal(overview.body.completed.treatmentPlans[0].prescriptions, undefined);

    const history = await send(`/api/treatment-plans/history?patient=${patientId}`);
    assert.equal(history.status, 200);
    assert.equal(history.body.counts.ACTIVE, 2);
    assert.equal(history.body.counts.COMPLETED, 1);
    assert.equal(history.body.counts.PLANNED, 1);
    const linked = history.body.treatmentPlans.find((item) => item.diagnosis === 'Due review');
    assert.equal(linked.prescriptions[0].medicineName, 'Amoxicillin');
    assert.equal(linked.progress[0].note, 'Plan created');

    const chart = await Patient.findById(patientId);
    assert.equal(chart.visits[0].treatments[0].notes, 'After food');
    assert.equal(chart.visits[0].treatments.length, 1);

    const missing = await send('/api/treatment-plans/history');
    assert.equal(missing.status, 400);
    const unknown = await send(`/api/treatment-plans/history?patient=${new mongoose.Types.ObjectId()}`);
    assert.equal(unknown.status, 404);
    const hiddenHistory = await send(`/api/treatment-plans/history?patient=${patientId}`, { cookie: pharmacistCookie });
    assert.equal(hiddenHistory.status, 403);
    const hiddenBoard = await send('/api/treatment-plans/overview', { cookie: pharmacistCookie });
    assert.equal(hiddenBoard.status, 403);
  });
});
