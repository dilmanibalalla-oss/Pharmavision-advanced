import { Router } from 'express';
import mongoose from 'mongoose';
import Discrepancy, { ALERT_STATUSES, presentAlert } from '../models/Discrepancy.js';
import User from '../models/User.js';
import { ALERT_READ, ALERT_WRITE, canonicalRole } from '../access.js';
import { recordAudit } from '../audit.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { cleanText, escapeRegex } from '../validate.js';

const router = Router();
router.use(requireAuth);

router.get('/', requireRole(...ALERT_READ), async (req, res) => {
  const filter = {};
  const status = cleanText(req.query.status, 20).toUpperCase();
  if (ALERT_STATUSES.includes(status)) filter.status = status;
  const q = cleanText(req.query.q, 80);
  if (q) {
    const regex = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ alertCode: regex }, { shelfName: regex }, { medicineName: regex }];
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const [total, records, counts] = await Promise.all([
    Discrepancy.countDocuments(filter),
    Discrepancy.find(filter).sort({ detectedAt: -1 }).skip((page - 1) * limit).limit(limit),
    Discrepancy.aggregate([{ $group: { _id: '$status', value: { $sum: 1 } } }]),
  ]);
  res.json({
    alerts: records.map(presentAlert),
    counts: Object.fromEntries(counts.map((row) => [row._id, row.value])),
    page,
    total,
    pages: total === 0 ? 0 : Math.ceil(total / limit),
  });
});

router.get('/:id', requireRole(...ALERT_READ), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Alert not found' });
  const alert = await Discrepancy.findById(req.params.id);
  if (!alert) return res.status(404).json({ message: 'Alert not found' });
  res.json(presentAlert(alert));
});

router.post('/:id/notes', requireRole(...ALERT_WRITE), async (req, res) => {
  const alert = await load(req.params.id);
  if (!alert) return res.status(404).json({ message: 'Alert not found' });
  const text = cleanText(req.body.text, 1000);
  if (text.length < 3) return res.status(400).json({ message: 'Write a note for the investigation' });
  alert.notes.push({ at: new Date(), userId: req.user._id, name: req.user.name, text });
  await alert.save();
  await recordAudit(req, { action: 'discrepancy-note', entityType: 'discrepancy', entityId: alert._id, summary: `Note added to ${alert.alertCode}` });
  res.json(presentAlert(alert));
});

router.post('/:id/evidence', requireRole(...ALERT_WRITE), async (req, res) => {
  const alert = await load(req.params.id);
  if (!alert) return res.status(404).json({ message: 'Alert not found' });
  const kind = cleanText(req.body.kind, 20);
  const ref = cleanText(req.body.ref, 40);
  const label = cleanText(req.body.label, 120);
  if (!['scan', 'movement', 'note'].includes(kind) || !label) {
    return res.status(400).json({ message: 'Evidence needs a type and a label' });
  }
  alert.evidence.push({ kind, ref, label });
  await alert.save();
  await recordAudit(req, { action: 'discrepancy-evidence', entityType: 'discrepancy', entityId: alert._id, summary: `Evidence added to ${alert.alertCode}` });
  res.json(presentAlert(alert));
});

router.patch('/:id', requireRole(...ALERT_WRITE), async (req, res) => {
  const alert = await load(req.params.id);
  if (!alert) return res.status(404).json({ message: 'Alert not found' });
  const status = cleanText(req.body.status, 20).toUpperCase();
  if (!ALERT_STATUSES.includes(status)) return res.status(400).json({ message: 'Choose a valid investigation status' });
  if (req.body.investigator) {
    if (!mongoose.isValidObjectId(req.body.investigator)) return res.status(400).json({ message: 'Choose an investigator' });
    const investigator = await User.findById(req.body.investigator);
    const role = canonicalRole(investigator?.role);
    if (!investigator?.active || !['ADMIN', 'SECURITY_OFFICER'].includes(role)) {
      return res.status(400).json({ message: 'The investigator must be an active security officer or admin' });
    }
    alert.investigator = investigator._id;
    alert.investigatorName = investigator.name;
  }
  if (status === 'RESOLVED' || status === 'DISMISSED') {
    if (alert.status !== 'UNDER_REVIEW') {
      return res.status(400).json({ message: 'A person must review the alert before it can be closed' });
    }
    if (!alert.investigator) return res.status(400).json({ message: 'Assign an investigator before closing the alert' });
    const resolution = cleanText(req.body.resolution, 1000);
    if (resolution.length < 10) return res.status(400).json({ message: 'Write how the alert was resolved' });
    const actor = String(req.user._id);
    if (actor !== String(alert.investigator) && canonicalRole(req.user.role) !== 'ADMIN') {
      return res.status(403).json({ message: 'Only the assigned investigator can close this alert' });
    }
    alert.resolution = resolution;
    alert.closedBy = req.user._id;
    alert.closedAt = new Date();
  }
  if (status === 'UNDER_REVIEW' && !alert.investigator) {
    return res.status(400).json({ message: 'Assign an investigator before review starts' });
  }
  alert.status = status;
  await alert.save();
  await recordAudit(req, { action: 'discrepancy-updated', entityType: 'discrepancy', entityId: alert._id, summary: `${alert.alertCode} marked ${status}` });
  res.json(presentAlert(alert));
});

async function load(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return Discrepancy.findById(id);
}

export default router;
