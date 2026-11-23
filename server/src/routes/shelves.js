import { Router } from 'express';
import mongoose from 'mongoose';
import Shelf, { presentShelf } from '../models/Shelf.js';
import Scan, { presentScan } from '../models/Scan.js';
import Medicine from '../models/Medicine.js';
import { SHELF_READ, SHELF_WRITE } from '../access.js';
import { allocateCode } from '../codes.js';
import { recordAudit } from '../audit.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { cleanText, escapeRegex } from '../validate.js';

const router = Router();
router.use(requireAuth);

function finite(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return number;
}

function readDevice(body) {
  const device = body.device || {};
  return {
    platform: cleanText(device.platform, 40),
    os: cleanText(device.os, 40),
    model: cleanText(device.model, 80),
    appVersion: cleanText(device.appVersion, 40),
  };
}

function readSpace(body) {
  const boundary = body.boundary || {};
  const points = Array.isArray(boundary.points) ? boundary.points.slice(0, 40) : [];
  const parsedPoints = [];
  for (const point of points) {
    const x = finite(point?.x, -10000, 10000);
    const y = finite(point?.y, -10000, 10000);
    const z = finite(point?.z ?? 0, -10000, 10000);
    if (x == null || y == null || z == null) return { error: 'Shelf boundary points must be numbers' };
    parsedPoints.push({ x, y, z });
  }
  const width = finite(boundary.width ?? 0, 0, 1000);
  const height = finite(boundary.height ?? 0, 0, 1000);
  const depth = finite(boundary.depth ?? 0, 0, 1000);
  if (width == null || height == null || depth == null) return { error: 'Shelf size must be a positive number' };
  const coordinate = body.coordinateSystem || {};
  const origin = coordinate.origin || {};
  return {
    boundary: {
      unit: cleanText(boundary.unit, 8) || 'm',
      width,
      height,
      depth,
      points: parsedPoints,
    },
    coordinateSystem: {
      name: cleanText(coordinate.name, 40) || 'shelf-local',
      handedness: cleanText(coordinate.handedness, 8) || 'right',
      up: cleanText(coordinate.up, 4) || 'y',
      unit: cleanText(coordinate.unit, 8) || 'm',
      origin: {
        x: finite(origin.x ?? 0, -10000, 10000) ?? 0,
        y: finite(origin.y ?? 0, -10000, 10000) ?? 0,
        z: finite(origin.z ?? 0, -10000, 10000) ?? 0,
      },
    },
  };
}

async function readSections(value) {
  if (value == null) return { sections: null };
  if (!Array.isArray(value) || value.length > 20) return { error: 'Add the shelf sections as a list' };
  const sections = [];
  const codes = new Set();
  for (const section of value) {
    const code = cleanText(section.code, 20).toUpperCase();
    const name = cleanText(section.name, 80);
    if (!code || !name) return { error: 'Each section needs a code and a name' };
    if (codes.has(code)) return { error: 'Section codes must be unique on a shelf' };
    codes.add(code);
    const requested = Array.isArray(section.medicines) ? section.medicines.slice(0, 40) : [];
    const medicines = [];
    for (const item of requested) {
      const id = typeof item === 'string' ? item : item?.medicine;
      if (!mongoose.isValidObjectId(id)) return { error: 'Choose medicines from the catalog' };
      const medicine = await Medicine.findOne({ _id: id, active: { $ne: false } });
      if (!medicine) return { error: 'One of those medicines is not in the catalog' };
      medicines.push({ medicine: medicine._id, medicineName: medicine.name });
    }
    sections.push({ code, name, medicines });
  }
  return { sections };
}

router.get('/', requireRole(...SHELF_READ), async (req, res) => {
  const filter = {};
  const q = cleanText(req.query.q, 80);
  if (q) {
    const regex = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: regex }, { shelfCode: regex }, { location: regex }];
  }
  const status = cleanText(req.query.status, 20).toUpperCase();
  if (status === 'ACTIVE' || status === 'INACTIVE') filter.status = status;
  const records = await Shelf.find(filter).sort({ name: 1 }).limit(200);
  res.json({ shelves: records.map(presentShelf) });
});

router.post('/', requireRole(...SHELF_WRITE), async (req, res) => {
  const name = cleanText(req.body.name, 120);
  const location = cleanText(req.body.location, 160);
  if (!name || !location) return res.status(400).json({ message: 'Shelf name and location are required' });
  const space = readSpace(req.body);
  if (space.error) return res.status(400).json({ message: space.error });
  const sections = await readSections(req.body.sections || []);
  if (sections.error) return res.status(400).json({ message: sections.error });
  const shelf = await Shelf.create({
    shelfCode: await allocateCode('shelf', 'SHF'),
    name,
    location,
    sections: sections.sections,
    ...space,
    device: readDevice(req.body),
    status: 'ACTIVE',
    createdBy: req.user._id,
    createdByName: req.user.name,
  });
  await recordAudit(req, { action: 'shelf-registered', entityType: 'shelf', entityId: shelf._id, summary: `Shelf ${shelf.shelfCode} registered` });
  res.status(201).json(presentShelf(shelf));
});

router.get('/:id', requireRole(...SHELF_READ), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Shelf not found' });
  const shelf = await Shelf.findById(req.params.id);
  if (!shelf) return res.status(404).json({ message: 'Shelf not found' });
  const scans = await Scan.find({ shelf: shelf._id }).sort({ createdAt: -1 }).limit(20);
  res.json({ ...presentShelf(shelf), scans: scans.map(presentScan) });
});

router.put('/:id', requireRole(...SHELF_WRITE), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Shelf not found' });
  const shelf = await Shelf.findById(req.params.id);
  if (!shelf) return res.status(404).json({ message: 'Shelf not found' });
  if (req.body.name != null) {
    const name = cleanText(req.body.name, 120);
    if (!name) return res.status(400).json({ message: 'Shelf name is required' });
    shelf.name = name;
  }
  if (req.body.location != null) {
    const location = cleanText(req.body.location, 160);
    if (!location) return res.status(400).json({ message: 'Location is required' });
    shelf.location = location;
  }
  if (req.body.status != null) {
    const status = cleanText(req.body.status, 20).toUpperCase();
    if (status !== 'ACTIVE' && status !== 'INACTIVE') return res.status(400).json({ message: 'Status must be active or inactive' });
    shelf.status = status;
  }
  if (req.body.boundary || req.body.coordinateSystem) {
    const space = readSpace({ ...presentShelf(shelf), ...req.body });
    if (space.error) return res.status(400).json({ message: space.error });
    shelf.boundary = space.boundary;
    shelf.coordinateSystem = space.coordinateSystem;
  }
  if (req.body.device) shelf.device = readDevice(req.body);
  if (req.body.sections) {
    const sections = await readSections(req.body.sections);
    if (sections.error) return res.status(400).json({ message: sections.error });
    shelf.sections = sections.sections;
  }
  await shelf.save();
  await recordAudit(req, { action: 'shelf-updated', entityType: 'shelf', entityId: shelf._id, summary: `Shelf ${shelf.shelfCode} updated` });
  res.json(presentShelf(shelf));
});

export default router;
