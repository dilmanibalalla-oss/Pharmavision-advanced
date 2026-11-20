import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User, { publicUser } from '../models/User.js';
import { cleanText } from '../validate.js';
import { requireAuth, signToken } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  const email = cleanText(req.body.email, 160).toLowerCase();
  const password = String(req.body.password ?? '');
  if (!email || !email.includes('@') || !password || password.length > 200) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const user = await User.findOne({ email }).select('+passwordHash');
  const matches = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !user.active || !matches) {
    return res.status(401).json({ message: 'Email or password is incorrect' });
  }

  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export default router;
