import jwt from 'jsonwebtoken';
import User from '../models/User.js';

function readSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const error = new Error('Missing JWT_SECRET');
    error.code = 'NO_SECRET';
    throw error;
  }
  return secret;
}

export function signToken(user) {
  return jwt.sign(
    { sub: String(user._id), role: user.role },
    readSecret(),
    { expiresIn: '12h' }
  );
}

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return res.status(401).json({ message: 'Sign in to continue' });

    const payload = jwt.verify(token, readSecret());
    const user = await User.findById(payload.sub);
    if (!user || !user.active) {
      return res.status(401).json({ message: 'Sign in to continue' });
    }
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
