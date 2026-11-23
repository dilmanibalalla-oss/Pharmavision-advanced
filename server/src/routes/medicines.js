import { Router } from 'express';
import mongoose from 'mongoose';
import Medicine from '../models/Medicine.js';
import { MEDICINE_READ, MEDICINE_WRITE } from '../access.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { MEDICINE_FORMS, cleanText, escapeRegex } from '../validate.js';

const router = Router();

router.use(requireAuth);
router.use((req, res, next) => {
  const roles = req.method === 'GET' || req.method === 'HEAD' ? MEDICINE_READ : MEDICINE_WRITE;
  return requireRole(...roles)(req, res, next);
});
const forms = new Set(MEDICINE_FORMS);

function readMedicine(body) {
  const name = cleanText(body.name, 80);
  const strength = cleanText(body.strength, 40);
  const form = cleanText(body.form, 40);
  if (!name) return { error: 'Medicine name is required' };
  if (!forms.has(form)) return { error: 'Choose a form from the list' };
  return { name, strength, form };
}

async function duplicate(medicine, ignoreId) {
  const filter = {
    name: new RegExp(`^${escapeRegex(medicine.name)}$`, 'i'),
    strength: new RegExp(`^${escapeRegex(medicine.strength)}$`, 'i'),
    form: medicine.form,
  };
  if (ignoreId) filter._id = { $ne: ignoreId };
  return Medicine.findOne(filter);
}

router.get('/', async (req, res) => {
  const q = cleanText(req.query.q, 80);
  const filter = q
    ? {
        $or: [
          { name: new RegExp(escapeRegex(q), 'i') },
          { strength: new RegExp(escapeRegex(q), 'i') },
          { form: new RegExp(escapeRegex(q), 'i') },
        ],
      }
    : {};
  const medicines = await Medicine.find(filter)
    .collation({ locale: 'en', strength: 2 })
    .sort({ name: 1, strength: 1 });
  res.json(medicines);
});

router.post('/', async (req, res) => {
  const medicine = readMedicine(req.body);
  if (medicine.error) return res.status(400).json({ message: medicine.error });
  if (await duplicate(medicine)) {
    return res.status(409).json({ message: 'That medicine is already in the catalog' });
  }
  try {
    const created = await Medicine.create(medicine);
    res.status(201).json(created);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'That medicine is already in the catalog' });
    }
    throw error;
  }
});

router.put('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'Medicine not found' });
  }
  const medicine = readMedicine(req.body);
  if (medicine.error) return res.status(400).json({ message: medicine.error });
  if (await duplicate(medicine, req.params.id)) {
    return res.status(409).json({ message: 'That medicine is already in the catalog' });
  }
  try {
    const updated = await Medicine.findByIdAndUpdate(req.params.id, medicine, {
      new: true,
      runValidators: true,
    });
    if (!updated) return res.status(404).json({ message: 'Medicine not found' });
    res.json(updated);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'That medicine is already in the catalog' });
    }
    throw error;
  }
});

router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'Medicine not found' });
  }
  const deleted = await Medicine.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ message: 'Medicine not found' });
  res.json({ ok: true });
});

export default router;
