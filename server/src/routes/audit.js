import { Router } from 'express';
import AuditLog, { presentAudit } from '../models/AuditLog.js';
import { AUDIT_READ } from '../access.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { cleanText, escapeRegex } from '../validate.js';

const router = Router();
router.use(requireAuth);

router.get('/', requireRole(...AUDIT_READ), async (req, res) => {
  const filter = {};
  const action = cleanText(req.query.action, 60);
  const entityType = cleanText(req.query.entity, 40);
  const q = cleanText(req.query.q, 80);
  if (action) filter.action = new RegExp(escapeRegex(action), 'i');
  if (entityType) filter.entityType = entityType;
  if (q) filter.summary = new RegExp(escapeRegex(q), 'i');
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(`${req.query.from}T00:00:00.000Z`);
    if (req.query.to) filter.createdAt.$lte = new Date(`${req.query.to}T23:59:59.999Z`);
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const [total, records] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
  ]);
  res.json({
    entries: records.map(presentAudit),
    page,
    limit,
    total,
    pages: total === 0 ? 0 : Math.ceil(total / limit),
  });
});

export default router;
