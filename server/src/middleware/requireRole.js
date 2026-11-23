import { canonicalRole } from '../access.js';

export function requireRole(...roles) {
  return (req, res, next) => {
    const role = canonicalRole(req.user?.role);
    if (!role || !roles.includes(role)) {
      return res.status(403).json({ message: 'You do not have access to that' });
    }
    if (req.user) req.user.role = role;
    return next();
  };
}
