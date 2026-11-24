import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { USER_ROLES, canonicalRole } from '../access.js';

const ACCESS_SECONDS = 15 * 60;
const REFRESH_SECONDS = 7 * 24 * 60 * 60;

function readSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const error = new Error('Missing JWT_SECRET');
    error.code = 'NO_SECRET';
    throw error;
  }
  return secret;
}

export function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (key !== name) continue;
    return decodeURIComponent(part.slice(index + 1).trim());
  }
  return '';
}

function cookieSuffix() {
  return process.env.NODE_ENV === 'production' ? '; Secure' : '';
}

export function setAuthCookies(res, accessToken, refreshToken) {
  const secure = cookieSuffix();
  res.setHeader('Set-Cookie', [
    `accessToken=${encodeURIComponent(accessToken)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${ACCESS_SECONDS}${secure}`,
    `refreshToken=${encodeURIComponent(refreshToken)}; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=${REFRESH_SECONDS}${secure}`,
  ]);
}

export function clearAuthCookies(res) {
  const secure = cookieSuffix();
  res.setHeader('Set-Cookie', [
    `accessToken=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`,
    `refreshToken=; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=0${secure}`,
  ]);
}

export function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user._id), role: canonicalRole(user.role) },
    readSecret(),
    { expiresIn: ACCESS_SECONDS, algorithm: 'HS256' }
  );
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function isMobileClient(req) {
  if (req.headers.origin) return false;
  return String(req.headers['x-pharmavision-client'] || '') === 'mobile';
}

function readRefreshToken(req) {
  const fromCookie = readCookie(req, 'refreshToken');
  if (fromCookie) return fromCookie;
  return String(req.headers['x-refresh-token'] || '').trim();
}

export async function issueSession(res, user) {
  const role = canonicalRole(user.role);
  const refreshToken = crypto.randomBytes(32).toString('base64url');
  const accessToken = signAccessToken({ _id: user._id, role });
  await User.updateOne(
    { _id: user._id },
    {
      role,
      refreshTokenHash: hashRefreshToken(refreshToken),
      refreshTokenExpiresAt: new Date(Date.now() + REFRESH_SECONDS * 1000),
    }
  );
  setAuthCookies(res, accessToken, refreshToken);
  return { accessToken, refreshToken };
}

export async function clearSession(req) {
  const refreshToken = readRefreshToken(req);
  if (!refreshToken) return;
  await User.updateOne(
    { refreshTokenHash: hashRefreshToken(refreshToken) },
    { $unset: { refreshTokenHash: 1, refreshTokenExpiresAt: 1 } }
  );
}

export async function findRefreshUser(req) {
  const refreshToken = readRefreshToken(req);
  if (!refreshToken) return null;
  return User.findOne({
    refreshTokenHash: hashRefreshToken(refreshToken),
    refreshTokenExpiresAt: { $gt: new Date() },
    active: true,
  }).select('+refreshTokenHash +refreshTokenExpiresAt');
}

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const token = bearer || readCookie(req, 'accessToken');
    if (!token) return res.status(401).json({ message: 'Sign in to continue' });

    const payload = jwt.verify(token, readSecret(), { algorithms: ['HS256'] });
    const user = await User.findById(payload.sub);
    const role = canonicalRole(user?.role);
    if (!user || !user.active || !USER_ROLES.includes(role)) {
      return res.status(401).json({ message: 'Sign in to continue' });
    }
    user.role = role;
    req.user = user;
    return next();
  } catch (error) {
    if (error.code === 'NO_SECRET') return next(error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Sign in to continue' });
    }
    return next(error);
  }
}
