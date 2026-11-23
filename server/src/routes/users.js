import { Router } from 'express';
import mongoose from 'mongoose';
import User, { publicUser } from '../models/User.js';
import { USER_READ, USER_WRITE, USER_ROLES, canonicalRole } from '../access.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { recordAudit } from '../audit.js';
import { cleanText } from '../validate.js';

const router = Router();

router.use(requireAuth);

router.get('/', requireRole(...USER_READ), async (_req, res) => {
  const users = await User.find().sort({ name: 1 });
  res.json(users.map(publicUser));
});

router.patch('/:id/active', requireRole(...USER_WRITE), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'Account not found' });
  }
  if (typeof req.body.active !== 'boolean') {
    return res.status(400).json({ message: 'Say whether the account is active' });
  }
  if (String(req.user._id) === req.params.id) {
    return res.status(400).json({ message: 'You cannot change your own access' });
  }

  const user = await User.findById(req.params.id).select('+refreshTokenHash +refreshTokenExpiresAt');
  if (!user) return res.status(404).json({ message: 'Account not found' });

  if (req.body.active === false && canonicalRole(user.role) === 'ADMIN') {
    const otherAdmins = await User.countDocuments({
      role: 'ADMIN',
      active: true,
      _id: { $ne: user._id },
    });
    if (otherAdmins === 0) {
      return res.status(400).json({ message: 'Keep at least one active admin' });
    }
  }

  user.active = req.body.active;
  await user.save();
  if (!user.active) {
    await User.updateOne(
      { _id: user._id },
      { $unset: { refreshTokenHash: 1, refreshTokenExpiresAt: 1 } }
    );
  }
  await recordAudit(req, {
    action: 'user-access',
    entityType: 'user',
    entityId: user._id,
    summary: user.active ? 'Account activated' : 'Account deactivated',
  });
  res.json({ user: publicUser(user) });
});

router.patch('/:id/role', requireRole(...USER_WRITE), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Account not found' });
  const role = canonicalRole(cleanText(req.body.role, 40));
  if (!USER_ROLES.includes(role)) return res.status(400).json({ message: 'Choose a valid role' });
  if (String(req.user._id) === req.params.id) return res.status(400).json({ message: 'You cannot change your own access' });
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'Account not found' });
  if (canonicalRole(user.role) === 'ADMIN' && role !== 'ADMIN') {
    const otherAdmins = await User.countDocuments({ role: 'ADMIN', active: true, _id: { $ne: user._id } });
    if (otherAdmins === 0) return res.status(400).json({ message: 'Keep at least one active admin' });
  }
  user.role = role;
  await user.save();
  await User.updateOne({ _id: user._id }, { $unset: { refreshTokenHash: 1, refreshTokenExpiresAt: 1 } });
  await recordAudit(req, { action: 'role-changed', entityType: 'user', entityId: user._id, summary: `Role set to ${role}` });
  res.json({ user: publicUser(user) });
});

export default router;
