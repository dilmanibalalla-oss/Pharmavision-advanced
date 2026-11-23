import crypto from 'crypto';
import { Router } from 'express';
import mongoose from 'mongoose';
import Shelf from '../models/Shelf.js';
import Scan, { presentScan } from '../models/Scan.js';
import { SCAN_READ, SCAN_WRITE } from '../access.js';
import { allocateCode } from '../codes.js';
import { recordAudit } from '../audit.js';
import { reviewShelf } from '../controllers/discrepancy.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { askDetection, detectionConfigured, serviceAuthorized } from '../services/detection.js';
import { readObservations } from '../services/observations.js';
import { cleanText, escapeRegex } from '../validate.js';
import { presentAlert } from '../models/Discrepancy.js';

const router = Router();
const MAX_IMAGE = 5 * 1024 * 1024;

function readImage(body) {
  const mime = cleanText(body?.image?.mime, 40).toLowerCase();
  const allowed = {
    'image/jpeg': 'ffd8ff',
    'image/png': '89504e47',
    'image/webp': '52494646',
  };
  if (!allowed[mime]) return { error: 'Use a JPEG, PNG, or WebP image' };
  const raw = String(body.image.data || '').replace(/^data:[^;]+;base64,/, '');
  if (!raw || raw.length > MAX_IMAGE * 2) return { error: 'Image must be under 5 MB' };
  let buffer;
  try {
    buffer = Buffer.from(raw, 'base64');
  } catch {
    return { error: 'That image could not be read' };
  }
  if (!buffer.length || buffer.length > MAX_IMAGE) return { error: 'Image must be under 5 MB' };
  const hex = buffer.subarray(0, 12).toString('hex');
  if (!hex.startsWith(allowed[mime])) return { error: 'That file is not the image type it claims to be' };
  if (mime === 'image/webp' && buffer.subarray(8, 12).toString() !== 'WEBP') {
    return { error: 'That file is not the image type it claims to be' };
  }
  return {
    mime,
    buffer,
    size: buffer.length,
    hash: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

async function applyObservations(scan, rows) {
  const parsed = await readObservations(rows);
  if (parsed.error) return parsed;
  scan.observations = parsed.observations;
  scan.status = 'OBSERVED';
  scan.recognition = {
    connected: detectionConfigured(),
    performed: true,
    message: 'Detection results were stored as observations. They did not change stock.',
  };
  await scan.save();
  return { scan };
}

router.post('/:id/results', async (req, res) => {
  if (!serviceAuthorized(req)) return res.status(401).json({ message: 'The detection service is not authorized' });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Scan not found' });
  const scan = await Scan.findById(req.params.id);
  if (!scan) return res.status(404).json({ message: 'Scan not found' });
  const applied = await applyObservations(scan, req.body.observations);
  if (applied.error) return res.status(400).json({ message: applied.error });
  const shelf = await Shelf.findById(scan.shelf);
  const alerts = shelf ? await reviewShelf(shelf, scan) : [];
  await recordAudit(req, { action: 'ai-results', entityType: 'scan', entityId: scan._id, summary: `Observations stored for ${scan.scanCode}` });
  res.json({ scan: presentScan(scan), alerts: alerts.map(presentAlert), stockChanged: false });
});

router.use(requireAuth);

router.get('/', requireRole(...SCAN_READ), async (req, res) => {
  const filter = {};
  if (mongoose.isValidObjectId(req.query.shelf)) filter.shelf = req.query.shelf;
  const q = cleanText(req.query.q, 80);
  if (q) filter.shelfName = new RegExp(escapeRegex(q), 'i');
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const [total, records] = await Promise.all([
    Scan.countDocuments(filter),
    Scan.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
  ]);
  res.json({
    scans: records.map(presentScan),
    recognitionConnected: detectionConfigured(),
    page,
    total,
    pages: total === 0 ? 0 : Math.ceil(total / limit),
  });
});

router.post('/', requireRole(...SCAN_WRITE), async (req, res) => {
  const requestId = cleanText(req.body.requestId, 80);
  if (requestId.length < 8) return res.status(400).json({ message: 'A scan reference is required' });
  const existing = await Scan.findOne({ requestId });
  if (existing) return res.json({ ...presentScan(existing), replay: true });
  if (!mongoose.isValidObjectId(req.body.shelf)) return res.status(400).json({ message: 'Choose a shelf' });
  const shelf = await Shelf.findById(req.body.shelf);
  if (!shelf || shelf.status !== 'ACTIVE') return res.status(400).json({ message: 'That shelf is not available for a scan' });
  const image = readImage(req.body);
  if (image.error) return res.status(400).json({ message: image.error });
  const section = cleanText(req.body.section, 20).toUpperCase();
  if (section && !(shelf.sections || []).some((item) => item.code === section)) {
    return res.status(400).json({ message: 'That section is not on this shelf' });
  }
  const device = req.body.device || {};
  const scan = await Scan.create({
    scanCode: await allocateCode('scan', 'SCN'),
    requestId,
    shelf: shelf._id,
    shelfCode: shelf.shelfCode,
    shelfName: shelf.name,
    section,
    status: 'RECEIVED',
    recognition: { connected: detectionConfigured(), performed: false, message: '' },
    device: {
      platform: cleanText(device.platform, 40),
      os: cleanText(device.os, 40),
      model: cleanText(device.model, 80),
      appVersion: cleanText(device.appVersion, 40),
    },
    imageMime: image.mime,
    imageSize: image.size,
    imageHash: image.hash,
    image: image.buffer,
    user: req.user._id,
    userName: req.user.name,
  });
  const answer = await askDetection(scan);
  scan.recognition = { connected: answer.connected, performed: false, message: answer.message };
  if (answer.observations) {
    const applied = await applyObservations(scan, answer.observations);
    if (applied.error) return res.status(400).json({ message: applied.error });
  } else {
    scan.status = answer.connected ? 'PENDING_AI' : 'RECEIVED';
    await scan.save();
  }
  shelf.lastScanAt = scan.createdAt;
  await shelf.save();
  if (scan.status === 'OBSERVED') await reviewShelf(shelf, scan);
  await recordAudit(req, { action: 'ai-scan', entityType: 'scan', entityId: scan._id, summary: `Scan ${scan.scanCode} received for ${shelf.shelfCode}` });
  res.status(201).json(presentScan(scan));
});

router.get('/:id', requireRole(...SCAN_READ), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Scan not found' });
  const scan = await Scan.findById(req.params.id);
  if (!scan) return res.status(404).json({ message: 'Scan not found' });
  res.json(presentScan(scan));
});

router.get('/:id/image', requireRole(...SCAN_READ), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Scan not found' });
  const scan = await Scan.findById(req.params.id).select('+image');
  if (!scan?.image) return res.status(404).json({ message: 'Scan not found' });
  res.setHeader('Content-Type', scan.imageMime || 'application/octet-stream');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(scan.image);
});

export default router;
