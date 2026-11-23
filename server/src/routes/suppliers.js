import { Router } from 'express';
import mongoose from 'mongoose';
import Supplier, { presentSupplier } from '../models/Supplier.js';
import PurchaseOrder, { presentOrder } from '../models/PurchaseOrder.js';
import { SUPPLIER_READ, SUPPLIER_WRITE } from '../access.js';
import { allocateCode } from '../codes.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { cleanText, escapeRegex, parseEmail, parsePhone } from '../validate.js';

const router = Router();
router.use(requireAuth);

function pageNumber(value) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function readSupplier(body, current) {
  const fields = {};
  const has = (key) => !current || Object.prototype.hasOwnProperty.call(body, key);
  if (has('name')) {
    const name = cleanText(body.name, 160);
    if (!name) return { error: 'Supplier name is required' };
    fields.name = name;
  }
  if (has('contactPerson')) {
    const contactPerson = cleanText(body.contactPerson, 120);
    if (!contactPerson) return { error: 'Contact person is required' };
    fields.contactPerson = contactPerson;
  }
  if (has('phone')) {
    const phone = parsePhone(body.phone);
    if (phone.error) return phone;
    fields.phone = phone.phone;
  }
  if (has('email')) {
    const raw = String(body.email ?? '').trim();
    if (!raw) fields.email = '';
    else {
      const email = parseEmail(raw);
      if (!email) return { error: 'A valid email is required' };
      fields.email = email;
    }
  }
  if (has('address')) {
    const address = cleanText(body.address, 300);
    if (!address) return { error: 'Address is required' };
    fields.address = address;
  }
  if (has('registration')) fields.registration = cleanText(body.registration, 200);
  if (has('notes')) fields.notes = cleanText(body.notes, 2000);
  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    const status = cleanText(body.status, 20);
    if (status !== 'ACTIVE' && status !== 'INACTIVE') return { error: 'Status must be active or inactive' };
    fields.status = status;
  } else if (!current) {
    fields.status = 'ACTIVE';
  }
  const phone = fields.phone ?? current?.phone ?? '';
  const email = fields.email ?? current?.email ?? '';
  if (!phone && !email) return { error: 'Enter a phone number or an email' };
  return { fields };
}

router.get('/', requireRole(...SUPPLIER_READ), async (req, res) => {
  const page = pageNumber(req.query.page);
  const limit = 20;
  const filter = {};
  const status = cleanText(req.query.status, 20);
  if (status === 'ACTIVE' || status === 'INACTIVE') filter.status = status;
  const q = cleanText(req.query.q, 80);
  if (q) {
    const regex = new RegExp(escapeRegex(q), 'i');
    filter.$or = [
      { name: regex },
      { supplierCode: regex },
      { contactPerson: regex },
      { phone: regex },
      { email: regex },
    ];
  }
  const [total, records] = await Promise.all([
    Supplier.countDocuments(filter),
    Supplier.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit),
  ]);
  res.json({
    suppliers: records.map(presentSupplier),
    page,
    limit,
    total,
    pages: total === 0 ? 0 : Math.ceil(total / limit),
  });
});

router.post('/', requireRole(...SUPPLIER_WRITE), async (req, res) => {
  const parsed = readSupplier(req.body);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  const supplier = await Supplier.create({
    ...parsed.fields,
    supplierCode: await allocateCode('supplier', 'SUP'),
    status: parsed.fields.status || 'ACTIVE',
  });
  res.status(201).json(presentSupplier(supplier));
});

router.get('/:id', requireRole(...SUPPLIER_READ), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Supplier not found' });
  const supplier = await Supplier.findById(req.params.id);
  if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
  res.json(presentSupplier(supplier));
});

router.get('/:id/purchases', requireRole(...SUPPLIER_READ), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Supplier not found' });
  const supplier = await Supplier.findById(req.params.id).select('_id');
  if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
  const orders = await PurchaseOrder.find({ supplier: supplier._id }).sort({ orderDate: -1, createdAt: -1 }).limit(50);
  res.json({ purchases: orders.map((order) => presentOrder(order)) });
});

router.put('/:id', requireRole(...SUPPLIER_WRITE), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Supplier not found' });
  const supplier = await Supplier.findById(req.params.id);
  if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
  const parsed = readSupplier(req.body, supplier);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  supplier.set(parsed.fields);
  await supplier.save();
  res.json(presentSupplier(supplier));
});

router.patch('/:id/status', requireRole(...SUPPLIER_WRITE), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Supplier not found' });
  const status = cleanText(req.body.status, 20);
  if (status !== 'ACTIVE' && status !== 'INACTIVE') {
    return res.status(400).json({ message: 'Status must be active or inactive' });
  }
  const supplier = await setSupplierStatus(req.params.id, status);
  if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
  res.json(presentSupplier(supplier));
});

async function setSupplierStatus(id, status) {
  return Supplier.findByIdAndUpdate(id, { status }, { new: true });
}

export default router;
