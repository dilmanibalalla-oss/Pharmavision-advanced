import { Router } from 'express';
import mongoose from 'mongoose';
import Medicine, { presentMedicine } from '../models/Medicine.js';
import { MEDICINE_READ, MEDICINE_WRITE } from '../access.js';
import { allocateCode } from '../codes.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  MEDICINE_FORMS,
  cleanText,
  escapeRegex,
  parseMinimumStock,
} from '../validate.js';

const router = Router();
const forms = new Set(MEDICINE_FORMS);

router.use(requireAuth);

function readMedicine(body, current) {
  const fields = {};
  const brand = cleanText(body.brandName ?? body.name, 80);
  if (!current || Object.prototype.hasOwnProperty.call(body, 'name') || Object.prototype.hasOwnProperty.call(body, 'brandName')) {
    if (!brand) return { error: 'Brand name is required' };
    fields.name = brand;
  }
  const form = cleanText(body.form ?? body.dosageForm, 40);
  if (!current || Object.prototype.hasOwnProperty.call(body, 'form') || Object.prototype.hasOwnProperty.call(body, 'dosageForm')) {
    if (!forms.has(form)) return { error: 'Choose a dosage form from the list' };
    fields.form = form;
  }
  const text = [
    ['genericName', 80],
    ['activeIngredient', 80],
    ['strength', 40],
    ['category', 80],
    ['manufacturer', 120],
    ['description', 2000],
    ['storageInstructions', 500],
  ];
  for (const [key, max] of text) {
    if (!current || Object.prototype.hasOwnProperty.call(body, key)) fields[key] = cleanText(body[key], max);
  }
  if (!current || Object.prototype.hasOwnProperty.call(body, 'barcode')) {
    const barcode = cleanText(body.barcode, 40);
    fields.barcode = barcode;
  }
  if (!current || Object.prototype.hasOwnProperty.call(body, 'prescriptionRequired')) {
    fields.prescriptionRequired = body.prescriptionRequired === true || body.prescriptionRequired === 'true';
  }
  if (!current || Object.prototype.hasOwnProperty.call(body, 'minimumStock')) {
    const minimum = parseMinimumStock(body.minimumStock);
    if (minimum.error) return minimum;
    fields.minimumStock = minimum.minimumStock;
    fields.reorderLevel = minimum.minimumStock;
  }
  return { fields };
}

async function duplicate(fields, ignoreId) {
  const name = fields.name;
  const strength = fields.strength ?? '';
  const form = fields.form;
  if (name && form) {
    const filter = {
      name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
      strength: new RegExp(`^${escapeRegex(strength)}$`, 'i'),
      form,
    };
    if (ignoreId) filter._id = { $ne: ignoreId };
    const match = await Medicine.findOne(filter).select('name medicineCode');
    if (match) return 'That medicine is already in the catalog';
  }
  if (fields.barcode) {
    const filter = { barcode: fields.barcode };
    if (ignoreId) filter._id = { $ne: ignoreId };
    const match = await Medicine.findOne(filter).select('medicineCode');
    if (match) return 'That barcode is already in the catalog';
  }
  return '';
}

function catalogFilter(query) {
  const filter = {};
  const active = cleanText(query.active, 5);
  if (active === 'false') filter.active = false;
  else if (active !== 'all') filter.active = { $ne: false };
  const form = cleanText(query.form, 40);
  if (form) {
    if (!forms.has(form)) return { error: 'Choose a dosage form from the list' };
    filter.form = form;
  }
  const category = cleanText(query.category, 80);
  if (category) filter.category = new RegExp(`^${escapeRegex(category)}$`, 'i');
  const generic = cleanText(query.generic, 80);
  if (generic) filter.genericName = new RegExp(escapeRegex(generic), 'i');
  const barcode = cleanText(query.barcode, 40);
  if (barcode) filter.barcode = barcode;
  const q = cleanText(query.q, 80);
  if (q) {
    const regex = new RegExp(escapeRegex(q), 'i');
    filter.$or = [
      { name: regex },
      { medicineCode: regex },
      { strength: regex },
      { form: regex },
    ];
  }
  return { filter };
}

function csvCell(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

router.get('/', requireRole(...MEDICINE_READ), async (req, res) => {
  const parsed = catalogFilter(req.query);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  const medicines = await Medicine.find(parsed.filter)
    .collation({ locale: 'en', strength: 2 })
    .sort({ name: 1, strength: 1 })
    .limit(500);
  res.json(medicines.map(presentMedicine));
});

router.get('/export', requireRole(...MEDICINE_READ), async (_req, res) => {
  const medicines = await Medicine.find().sort({ name: 1, strength: 1 });
  const header = [
    'medicineCode', 'brandName', 'genericName', 'activeIngredient', 'strength', 'form',
    'category', 'manufacturer', 'barcode', 'description', 'storageInstructions',
    'prescriptionRequired', 'minimumStock', 'active',
  ];
  const lines = medicines.map((record) => {
    const view = presentMedicine(record);
    return header.map((key) => csvCell(view[key])).join(',');
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="medicine-catalog.csv"');
  res.send([header.join(','), ...lines].join('\n'));
});

router.post('/import', requireRole(...MEDICINE_WRITE), async (req, res) => {
  const rows = Array.isArray(req.body?.medicines) ? req.body.medicines : null;
  if (!rows) return res.status(400).json({ message: 'Import a list of medicines' });
  if (rows.length > 500) return res.status(400).json({ message: 'Import at most 500 medicines at a time' });
  const created = [];
  const skipped = [];
  for (let index = 0; index < rows.length; index += 1) {
    const parsed = readMedicine(rows[index]);
    if (parsed.error) {
      skipped.push({ row: index + 1, message: parsed.error });
      continue;
    }
    const clash = await duplicate(parsed.fields);
    if (clash) {
      skipped.push({ row: index + 1, message: clash });
      continue;
    }
    try {
      const medicine = await Medicine.create({
        ...parsed.fields,
        medicineCode: await allocateCode('medicine', 'MED'),
        barcode: parsed.fields.barcode || undefined,
      });
      created.push(presentMedicine(medicine));
    } catch (error) {
      if (error.code === 11000) skipped.push({ row: index + 1, message: 'That medicine is already in the catalog' });
      else throw error;
    }
  }
  res.status(201).json({ created: created.length, medicines: created, skipped });
});

router.post('/', requireRole(...MEDICINE_WRITE), async (req, res) => {
  const parsed = readMedicine(req.body);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  const clash = await duplicate(parsed.fields);
  if (clash) return res.status(409).json({ message: clash });
  try {
    const medicine = await Medicine.create({
      ...parsed.fields,
      medicineCode: await allocateCode('medicine', 'MED'),
      barcode: parsed.fields.barcode || undefined,
    });
    res.status(201).json(presentMedicine(medicine));
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'That medicine is already in the catalog' });
    throw error;
  }
});

router.patch('/:id/active', requireRole(...MEDICINE_WRITE), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Medicine not found' });
  if (typeof req.body.active !== 'boolean') return res.status(400).json({ message: 'Say whether the medicine is active' });
  const medicine = await Medicine.findByIdAndUpdate(
    req.params.id,
    { active: req.body.active },
    { new: true }
  );
  if (!medicine) return res.status(404).json({ message: 'Medicine not found' });
  res.json(presentMedicine(medicine));
});

router.put('/:id', requireRole(...MEDICINE_WRITE), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Medicine not found' });
  const current = await Medicine.findById(req.params.id);
  if (!current) return res.status(404).json({ message: 'Medicine not found' });
  const parsed = readMedicine(req.body, current);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  const next = {
    name: parsed.fields.name || current.name,
    strength: parsed.fields.strength ?? current.strength,
    form: parsed.fields.form || current.form,
    barcode: Object.prototype.hasOwnProperty.call(parsed.fields, 'barcode') ? parsed.fields.barcode : current.barcode,
  };
  const clash = await duplicate(next, current._id);
  if (clash) return res.status(409).json({ message: clash });
  if (Object.prototype.hasOwnProperty.call(parsed.fields, 'barcode') && !parsed.fields.barcode) {
    current.barcode = undefined;
    delete parsed.fields.barcode;
  }
  current.set(parsed.fields);
  try {
    await current.save();
    res.json(presentMedicine(current));
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'That medicine is already in the catalog' });
    throw error;
  }
});

router.delete('/:id', requireRole(...MEDICINE_WRITE), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Medicine not found' });
  const medicine = await Medicine.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  if (!medicine) return res.status(404).json({ message: 'Medicine not found' });
  res.json({ ok: true, medicine: presentMedicine(medicine) });
});

export default router;
