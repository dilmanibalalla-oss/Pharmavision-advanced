import { Router } from 'express';
import mongoose from 'mongoose';
import PurchaseOrder, { PO_STATUSES, orderTotal, presentOrder } from '../models/PurchaseOrder.js';
import Supplier from '../models/Supplier.js';
import Medicine from '../models/Medicine.js';
import Receipt from '../models/Receipt.js';
import { PURCHASE_READ, PURCHASE_WRITE } from '../access.js';
import { allocateCode } from '../codes.js';
import { receiveOrder, StockError } from '../controllers/stock.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { recordAudit } from '../audit.js';
import { cleanText, parseQuantity, parseStockDate, parseUnitCost } from '../validate.js';

const router = Router();
router.use(requireAuth);

function pageNumber(value) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function sendError(res, error) {
  if (error instanceof StockError) return res.status(error.status).json({ message: error.message });
  throw error;
}

async function readItems(rows, current = []) {
  if (!Array.isArray(rows) || rows.length === 0) return { error: 'Add at least one medicine' };
  if (rows.length > 40) return { error: 'An order can list at most 40 medicines' };
  const items = [];
  const seen = new Set(current.map((item) => String(item.medicine)));
  for (const row of rows) {
    if (!mongoose.isValidObjectId(row.medicine)) return { error: 'Choose a medicine from the catalog' };
    if (seen.has(String(row.medicine))) return { error: 'That medicine is already on this order' };
    seen.add(String(row.medicine));
    const quantity = parseQuantity(row.quantity, 'Ordered quantity');
    if (quantity.error) return quantity;
    const cost = parseUnitCost(row.unitCost);
    if (cost.error) return cost;
    const medicine = await Medicine.findById(row.medicine);
    if (!medicine || medicine.active === false) return { error: 'Choose an active medicine from the catalog' };
    items.push({
      medicine: medicine._id,
      medicineName: medicine.name,
      strength: medicine.strength || '',
      form: medicine.form,
      quantity: quantity.quantity,
      receivedQuantity: 0,
      unitCost: cost.unitCost,
    });
  }
  return { items };
}

router.get('/', requireRole(...PURCHASE_READ), async (req, res) => {
  const page = pageNumber(req.query.page);
  const limit = 20;
  const filter = {};
  if (mongoose.isValidObjectId(req.query.supplier)) filter.supplier = req.query.supplier;
  const status = cleanText(req.query.status, 30);
  if (status) {
    if (!PO_STATUSES.includes(status)) return res.status(400).json({ message: 'Status is not one of the listed values' });
    filter.status = status;
  }
  const q = cleanText(req.query.q, 80);
  if (q) {
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ orderCode: regex }, { supplierName: regex }, { supplierCode: regex }];
  }
  const [total, records] = await Promise.all([
    PurchaseOrder.countDocuments(filter),
    PurchaseOrder.find(filter).sort({ orderDate: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit),
  ]);
  res.json({
    purchaseOrders: records.map((record) => presentOrder(record)),
    page,
    limit,
    total,
    pages: total === 0 ? 0 : Math.ceil(total / limit),
  });
});

router.post('/', requireRole(...PURCHASE_WRITE), async (req, res) => {
  if (!mongoose.isValidObjectId(req.body.supplier)) return res.status(400).json({ message: 'Choose a supplier' });
  const supplier = await Supplier.findById(req.body.supplier);
  if (!supplier || supplier.status !== 'ACTIVE') return res.status(400).json({ message: 'Choose an active supplier' });
  const orderDate = parseStockDate(req.body.orderDate, 'Order date', true);
  if (orderDate.error) return res.status(400).json({ message: orderDate.error });
  const expected = parseStockDate(req.body.expectedDelivery, 'Expected delivery date');
  if (expected.error) return res.status(400).json({ message: expected.error });
  if (expected.date && expected.date < orderDate.date) {
    return res.status(400).json({ message: 'Expected delivery cannot be before the order date' });
  }
  const parsed = await readItems(req.body.items);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  const status = cleanText(req.body.status, 30) || 'ORDERED';
  if (status !== 'DRAFT' && status !== 'ORDERED') {
    return res.status(400).json({ message: 'A new order starts as draft or ordered' });
  }
  const order = await PurchaseOrder.create({
    orderCode: await allocateCode('purchase', 'PO'),
    supplier: supplier._id,
    supplierName: supplier.name,
    supplierCode: supplier.supplierCode || '',
    orderDate: orderDate.date,
    expectedDelivery: expected.date,
    items: parsed.items,
    totalAmount: orderTotal(parsed.items),
    status,
    audit: [{
      at: new Date(),
      userId: req.user._id,
      name: req.user.name,
      action: 'created',
      note: status,
    }],
  });
  res.status(201).json(presentOrder(order, true));
});

router.get('/:id', requireRole(...PURCHASE_READ), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Purchase order not found' });
  const order = await PurchaseOrder.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Purchase order not found' });
  const receipts = await Receipt.find({ purchaseOrder: order._id, status: 'posted' }).sort({ createdAt: 1 });
  res.json({
    ...presentOrder(order, true),
    receipts: receipts.map((receipt) => ({
      _id: receipt._id,
      requestId: receipt.requestId,
      at: receipt.createdAt,
      name: receipt.name,
      lines: receipt.lines,
    })),
  });
});

router.post('/:id/items', requireRole(...PURCHASE_WRITE), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Purchase order not found' });
  const order = await PurchaseOrder.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Purchase order not found' });
  if (!['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED'].includes(order.status)) {
    return res.status(400).json({ message: 'Items cannot be added to this order' });
  }
  const parsed = await readItems(Array.isArray(req.body.items) ? req.body.items : [req.body], order.items);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  order.items.push(...parsed.items);
  order.totalAmount = orderTotal(order.items);
  order.audit.push({ at: new Date(), userId: req.user._id, name: req.user.name, action: 'items-added', note: '' });
  await order.save();
  res.json(presentOrder(order, true));
});

router.patch('/:id/status', requireRole(...PURCHASE_WRITE), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Purchase order not found' });
  const order = await PurchaseOrder.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Purchase order not found' });
  const status = cleanText(req.body.status, 30);
  if (status === 'CANCELLED') {
    const received = order.items.some((item) => (item.receivedQuantity || 0) > 0);
    if (received) return res.status(400).json({ message: 'A received order cannot be cancelled' });
    order.status = 'CANCELLED';
  } else if (status === 'ORDERED' && order.status === 'DRAFT') {
    order.status = 'ORDERED';
  } else {
    return res.status(400).json({ message: 'That status change is not available' });
  }
  order.audit.push({ at: new Date(), userId: req.user._id, name: req.user.name, action: 'status', note: order.status });
  await order.save();
  res.json(presentOrder(order, true));
});

router.post('/:id/receive', requireRole(...PURCHASE_WRITE), async (req, res) => {
  try {
    const result = await receiveOrder(req.params.id, req.body, req.user);
    if (!result.replay) {
      await recordAudit(req, { action: 'purchase-received', entityType: 'purchase-order', entityId: req.params.id, summary: 'Purchase receipt recorded' });
    }
    res.status(result.replay ? 200 : 201).json(result);
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
