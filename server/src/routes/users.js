import { Router } from 'express';
import mongoose from 'mongoose';
import User, { publicUser } from '../models/User.js';
import { USER_READ, USER_WRITE, canonicalRole } from '../access.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';

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
  res.json({ user: publicUser(user) });
});

export default router;
