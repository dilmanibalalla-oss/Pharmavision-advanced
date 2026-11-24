import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User, { publicUser } from '../models/User.js';
import { USER_ROLES, canonicalRole } from '../access.js';
import { cleanText } from '../validate.js';
import { recordAudit } from '../audit.js';
import { rateLimit } from '../middleware/security.js';
import {
  clearAuthCookies,
  clearSession,
  findRefreshUser,
  isMobileClient,
  issueSession,
  requireAuth,
} from '../middleware/auth.js';

const router = Router();
const limitLogin = rateLimit({ name: 'LOGIN', limit: 100, windowMs: 60 * 1000 });

function readPassword(value) {
  return String(value ?? '');
}

function sessionPayload(req, user, tokens) {
  const body = { user: publicUser(user) };
  if (isMobileClient(req)) {
    body.accessToken = tokens.accessToken;
    body.refreshToken = tokens.refreshToken;
  }
  return body;
}

router.post('/login', limitLogin, async (req, res) => {
  const email = cleanText(req.body.email, 160).toLowerCase();
  const password = readPassword(req.body.password);
  if (!email || !email.includes('@') || !password || password.length > 200) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const user = await User.findOne({ email }).select('+passwordHash');
  const matches = user ? await bcrypt.compare(password, user.passwordHash) : false;
  const role = canonicalRole(user?.role);
  if (!user || !user.active || !matches || !USER_ROLES.includes(role)) {
    return res.status(401).json({ message: 'Email or password is incorrect' });
  }

  user.role = role;
  const tokens = await issueSession(res, user);
  req.user = user;
  await recordAudit(req, { action: 'login', entityType: 'user', entityId: user._id, summary: 'Signed in' });
  res.json(sessionPayload(req, user, tokens));
});

router.post('/refresh', async (req, res) => {
  const user = await findRefreshUser(req);
  const role = canonicalRole(user?.role);
  if (!user || !USER_ROLES.includes(role)) {
    clearAuthCookies(res);
    return res.status(401).json({ message: 'Sign in to continue' });
  }
  user.role = role;
  const tokens = await issueSession(res, user);
  res.json(sessionPayload(req, user, tokens));
});

router.post('/logout', async (req, res) => {
  const user = await findRefreshUser(req);
  if (user) req.user = user;
  await recordAudit(req, { action: 'logout', entityType: 'user', entityId: user?._id, summary: 'Signed out' });
  await clearSession(req);
  clearAuthCookies(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.patch('/profile', requireAuth, async (req, res) => {
  const name = cleanText(req.body.name, 120);
  if (!name) return res.status(400).json({ message: 'Name is required' });
  const updated = await User.findByIdAndUpdate(
    req.user._id,
    { name },
    { new: true, runValidators: true }
  );
  res.json({ user: publicUser(updated) });
});

router.post('/password', requireAuth, async (req, res) => {
  const currentPassword = readPassword(req.body.currentPassword);
  const newPassword = readPassword(req.body.newPassword);
  if (newPassword.length < 8 || newPassword.length > 200) {
    return res.status(400).json({ message: 'Use a password of at least 8 characters' });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ message: 'Choose a different password' });
  }

  const user = await User.findById(req.user._id).select('+passwordHash');
  const matches = user ? await bcrypt.compare(currentPassword, user.passwordHash) : false;
  if (!user || !matches) {
    return res.status(400).json({ message: 'Current password is incorrect' });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.role = canonicalRole(user.role);
  await user.save();
  const tokens = await issueSession(res, user);
  res.json(sessionPayload(req, user, tokens));
});

export default router;
