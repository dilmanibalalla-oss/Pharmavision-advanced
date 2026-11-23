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
process.env.MONGODB_URI = mongo.getUri('helio_practice');

const { default: app } = await import('../src/app.js');
const { default: User } = await import('../src/models/User.js');

let server;
let base;
let adminCookie;
let doctorCookie;
let securityCookie;
let legacyId;

function cookieHeader(response) {
  const rows = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  return rows.map((row) => row.split(';')[0]).join('; ');
}

async function login(email, password = 'correct-password') {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json();
  return { status: response.status, body, cookie: cookieHeader(response) };
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

describe('doctor management', { concurrency: 1 }, () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const passwordHash = await bcrypt.hash('correct-password', 10);
    await User.create([
      { name: 'Clinic admin', email: 'admin@helio.local', passwordHash, role: 'ADMIN', active: true },
      { name: 'Dr Lee', email: 'lee@helio.local', passwordHash, role: 'DOCTOR', active: true, specialization: 'Family medicine' },
      { name: 'Store lead', email: 'store@helio.local', passwordHash, role: 'INVENTORY_MANAGER', active: true },
      { name: 'Safety lead', email: 'safety@helio.local', passwordHash, role: 'SECURITY_OFFICER', active: true },
    ]);
    const legacy = await User.create({
      name: 'Dr Old',
      email: 'old.doctor@helio.local',
      passwordHash,
      role: 'doctor',
      active: true,
      phone: '0112000000',
    });
    legacyId = String(legacy._id);
    server = app.listen(0);
    base = `http://127.0.0.1:${server.address().port}`;
    adminCookie = (await login('admin@helio.local')).cookie;
    doctorCookie = (await login('lee@helio.local')).cookie;
    securityCookie = (await login('safety@helio.local')).cookie;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    delete globalThis.helioDb;
    await mongoose.disconnect();
    await mongo.stop();
  });

  test('lists existing doctor accounts, including legacy roles, without secrets', async () => {
    const listed = await send('/api/doctors?limit=10');
    assert.equal(listed.status, 200);
    const names = listed.body.doctors.map((doctor) => doctor.name).sort();
    assert.deepEqual(names, ['Dr Lee', 'Dr Old']);
    assert.equal(listed.body.total, 2);
    assert.equal(JSON.stringify(listed.body).includes('passwordHash'), false);
    assert.equal(JSON.stringify(listed.body).includes('refreshToken'), false);
    const old = listed.body.doctors.find((doctor) => doctor._id === legacyId);
    assert.equal(old.role, 'DOCTOR');
    assert.equal(old.phone, '0112000000');
  });

  test('registers, edits, schedules, and deactivates one doctor account', async () => {
    const created = await send('/api/doctors', {
      method: 'POST',
      body: {
        name: 'Dr Nimal Perera',
        email: 'nimal@helio.local',
        password: 'clinic-pass',
        specialization: 'Cardiology',
        qualifications: ['MBBS', 'MD Cardiology', 'MBBS'],
        registrationNumber: 'slmc-2048',
        registrationBody: 'Sri Lanka Medical Council',
        phone: '+94 11 200 0000',
        address: '12 Ward Place',
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.doctor.registrationNumber, 'SLMC-2048');
    assert.deepEqual(created.body.doctor.qualifications, ['MBBS', 'MD Cardiology']);
    assert.equal(created.body.doctor.passwordHash, undefined);
    const id = created.body.doctor._id;

    const profile = await send(`/api/doctors/${id}`);
    assert.equal(profile.status, 200);
    assert.equal(profile.body.doctor.email, 'nimal@helio.local');

    const edited = await send(`/api/doctors/${id}`, {
      method: 'PUT',
      body: { phone: '0112550000', qualifications: ['MBBS', 'MD Cardiology'] },
    });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.doctor.phone, '0112550000');
    assert.equal(edited.body.doctor.specialization, 'Cardiology');
    assert.equal(edited.body.doctor.address, '12 Ward Place');

    const scheduled = await send(`/api/doctors/${id}/schedule`, {
      method: 'PUT',
      body: {
        schedule: [
          { day: 'Monday', start: '09:00', end: '12:00', location: 'Room 2' },
          { day: 'Monday', start: '13:00', end: '16:00', location: 'Room 2' },
        ],
      },
    });
    assert.equal(scheduled.status, 200);
    assert.equal(scheduled.body.doctor.schedule.length, 2);
    assert.equal(scheduled.body.doctor.name, 'Dr Nimal Perera');

    const overlap = await send(`/api/doctors/${id}/schedule`, {
      method: 'PUT',
      body: { schedule: [{ day: 'Monday', start: '10:00', end: '11:00', location: '' }, { day: 'Monday', start: '10:30', end: '12:00', location: '' }] },
    });
    assert.equal(overlap.status, 400);

    const stillThere = await send(`/api/doctors/${id}`);
    assert.equal(stillThere.body.doctor.schedule.length, 2);

    const searched = await send('/api/doctors?q=Cardiology&specialization=cardiology&active=true');
    assert.equal(searched.body.doctors.some((doctor) => doctor._id === id), true);

    const renamed = await send('/api/doctors/specializations', {
      method: 'PATCH',
      body: { from: 'cardiology', to: 'Heart clinic' },
    });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.updated, 1);
    const names = await send('/api/doctors/specializations');
    assert.equal(names.body.specializations.includes('Heart clinic'), true);
    assert.equal(names.body.specializations.includes('Cardiology'), false);

    const signedIn = await login('nimal@helio.local', 'clinic-pass');
    assert.equal(signedIn.status, 200);
    const deactivated = await send(`/api/doctors/${id}/active`, {
      method: 'PATCH',
      body: { active: false },
    });
    assert.equal(deactivated.status, 200);
    assert.equal(deactivated.body.doctor.active, false);
    const rejected = await login('nimal@helio.local', 'clinic-pass');
    assert.equal(rejected.status, 401);
    const inactive = await send('/api/doctors?active=false&q=Nimal');
    assert.equal(inactive.body.total, 1);
    const restored = await send(`/api/doctors/${id}/active`, {
      method: 'PATCH',
      body: { active: true },
    });
    assert.equal(restored.body.doctor.active, true);
  });

  test('paginates and refuses duplicate emails or registration numbers', async () => {
    const first = await send('/api/doctors', {
      method: 'POST',
      body: {
        name: 'Dr Ada Page',
        email: 'ada.page@helio.local',
        password: 'clinic-pass',
        specialization: 'Pagination clinic',
      },
    });
    const second = await send('/api/doctors', {
      method: 'POST',
      body: {
        name: 'Dr Bev Page',
        email: 'bev.page@helio.local',
        password: 'clinic-pass',
        specialization: 'Pagination clinic',
      },
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    const page = await send('/api/doctors?specialization=Pagination%20clinic&limit=1&page=2');
    assert.equal(page.status, 200);
    assert.equal(page.body.total, 2);
    assert.equal(page.body.pages, 2);
    assert.equal(page.body.doctors.length, 1);
    assert.equal(page.body.doctors[0].name, 'Dr Bev Page');

    const duplicateEmail = await send('/api/doctors', {
      method: 'POST',
      body: {
        name: 'Dr Copy',
        email: 'ada.page@helio.local',
        password: 'clinic-pass',
        specialization: 'Pagination clinic',
      },
    });
    assert.equal(duplicateEmail.status, 409);
    const duplicateNumber = await send(`/api/doctors/${second.body.doctor._id}`, {
      method: 'PUT',
      body: { registrationNumber: 'SLMC-2048' },
    });
    assert.equal(duplicateNumber.status, 409);
    const untouched = await send(`/api/doctors/${second.body.doctor._id}`);
    assert.equal(untouched.body.doctor.registrationNumber, '');
  });

  test('keeps doctor routes inside role permissions', async () => {
    const doctorList = await send('/api/doctors', { cookie: doctorCookie });
    assert.equal(doctorList.status, 200);
    const doctorCreate = await send('/api/doctors', {
      method: 'POST',
      cookie: doctorCookie,
      body: { name: 'Nope', email: 'nope@helio.local', password: 'clinic-pass', specialization: 'Surgery' },
    });
    assert.equal(doctorCreate.status, 403);
    const securityList = await send('/api/doctors', { cookie: securityCookie });
    assert.equal(securityList.status, 200);
    const storeList = await send('/api/doctors', { cookie: (await login('store@helio.local')).cookie });
    assert.equal(storeList.status, 403);

    const admin = await User.findOne({ email: 'admin@helio.local' });
    const hidden = await send(`/api/doctors/${admin._id}`, { method: 'PUT', body: { name: 'Renamed admin' } });
    assert.equal(hidden.status, 404);
    const stillAdmin = await User.findOne({ email: 'admin@helio.local' });
    assert.equal(stillAdmin.name, 'Clinic admin');
    const legacy = await User.findById(legacyId);
    assert.equal(legacy.name, 'Dr Old');
    assert.equal(legacy.phone, '0112000000');
  });
});
