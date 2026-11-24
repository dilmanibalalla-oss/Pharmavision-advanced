import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
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

function cookieHeader(response) {
  const rows = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  return rows.map((row) => row.split(';')[0]).join('; ');
}

async function login(email, password) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json();
  return { status: response.status, body, cookie: cookieHeader(response), cookies: response.headers.getSetCookie?.() || [] };
}

before(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const passwordHash = await bcrypt.hash('correct-password', 10);
  await User.create([
    { name: 'Clinic admin', email: 'admin@helio.local', passwordHash, role: 'ADMIN', active: true },
    { name: 'Dr Lee', email: 'lee@helio.local', passwordHash, role: 'DOCTOR', active: true },
    { name: 'Store lead', email: 'store@helio.local', passwordHash, role: 'INVENTORY_MANAGER', active: true },
  ]);
  await User.collection.insertOne({
    name: 'Dr Old',
    email: 'old.doctor@helio.local',
    passwordHash,
    role: 'doctor',
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
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

test('successful login returns the user and keeps tokens out of the body', async () => {
  const result = await login('admin@helio.local', 'correct-password');
  assert.equal(result.status, 200);
  assert.equal(result.body.user.email, 'admin@helio.local');
  assert.equal(result.body.user.role, 'ADMIN');
  assert.equal(result.body.passwordHash, undefined);
  assert.equal(result.body.user.passwordHash, undefined);
  assert.equal(result.body.token, undefined);
  assert.equal(result.body.accessToken, undefined);
  assert.equal(result.body.refreshToken, undefined);
  assert.match(result.cookies.join('\n'), /accessToken=/);
  assert.match(result.cookies.join('\n'), /HttpOnly/);
  assert.doesNotMatch(JSON.stringify(result.body), /\$2[aby]\$/);
});

test('legacy doctor accounts can still sign in', async () => {
  const result = await login('old.doctor@helio.local', 'correct-password');
  assert.equal(result.status, 200);
  assert.equal(result.body.user.role, 'DOCTOR');
  assert.equal(result.body.user.passwordHash, undefined);
});

test('invalid credentials are rejected', async () => {
  const wrong = await login('admin@helio.local', 'not-the-password');
  const missing = await login('nobody@helio.local', 'correct-password');
  assert.equal(wrong.status, 401);
  assert.equal(missing.status, 401);
  assert.equal(wrong.body.message, 'Email or password is incorrect');
  assert.equal(wrong.body.passwordHash, undefined);
  assert.equal(wrong.body.token, undefined);
  assert.equal(wrong.cookies.length, 0);
});

test('expired tokens are rejected', async () => {
  const admin = await User.findOne({ email: 'admin@helio.local' });
  const token = jwt.sign(
    { sub: String(admin._id), role: 'ADMIN', exp: Math.floor(Date.now() / 1000) - 60 },
    process.env.JWT_SECRET
  );
  const response = await fetch(`${base}/api/patients`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.message, 'Sign in to continue');
  assert.equal(body.passwordHash, undefined);
});

test('a role without access is rejected', async () => {
  const store = await login('store@helio.local', 'correct-password');
  const doctor = await login('lee@helio.local', 'correct-password');
  const chart = { name: 'Ada', age: 40, address: '1 Road' };

  const denied = await fetch(`${base}/api/patients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: store.cookie },
    body: JSON.stringify(chart),
  });
  const deniedBody = await denied.json();
  assert.equal(denied.status, 403);
  assert.equal(deniedBody.message, 'You do not have access to that');

  const allowed = await fetch(`${base}/api/patients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: doctor.cookie },
    body: JSON.stringify(chart),
  });
  const allowedBody = await allowed.json();
  assert.equal(allowed.status, 201);
  assert.equal(allowedBody.name, 'Ada');
  assert.equal(allowedBody.passwordHash, undefined);
});

test('a browser origin does not receive mobile tokens', async () => {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Pharmavision-Client': 'mobile',
      Origin: 'http://localhost:5175',
    },
    body: JSON.stringify({ email: 'store@helio.local', password: 'correct-password' }),
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.user.email, 'store@helio.local');
  assert.equal(body.accessToken, undefined);
  assert.equal(body.refreshToken, undefined);
});

test('mobile client receives tokens and can refresh with a header', async () => {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Pharmavision-Client': 'mobile',
    },
    body: JSON.stringify({ email: 'lee@helio.local', password: 'correct-password' }),
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.user.email, 'lee@helio.local');
  assert.equal(typeof body.accessToken, 'string');
  assert.equal(typeof body.refreshToken, 'string');
  assert.equal(body.passwordHash, undefined);
  assert.equal(body.user.passwordHash, undefined);

  const me = await fetch(`${base}/api/auth/me`, {
    headers: { Authorization: `Bearer ${body.accessToken}` },
  });
  const meBody = await me.json();
  assert.equal(me.status, 200);
  assert.equal(meBody.user.email, 'lee@helio.local');

  const refreshed = await fetch(`${base}/api/auth/refresh`, {
    method: 'POST',
    headers: {
      'X-Pharmavision-Client': 'mobile',
      'X-Refresh-Token': body.refreshToken,
    },
  });
  const refreshedBody = await refreshed.json();
  assert.equal(refreshed.status, 200);
  assert.equal(typeof refreshedBody.accessToken, 'string');
  assert.notEqual(refreshedBody.refreshToken, body.refreshToken);

  const loggedOut = await fetch(`${base}/api/auth/logout`, {
    method: 'POST',
    headers: { 'X-Refresh-Token': refreshedBody.refreshToken },
  });
  assert.equal(loggedOut.status, 200);

  const again = await fetch(`${base}/api/auth/refresh`, {
    method: 'POST',
    headers: {
      'X-Pharmavision-Client': 'mobile',
      'X-Refresh-Token': refreshedBody.refreshToken,
    },
  });
  assert.equal(again.status, 401);
});
