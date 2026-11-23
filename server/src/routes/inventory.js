import { Router } from 'express';
import StockMovement, { presentMovement } from '../models/StockMovement.js';
import { INVENTORY_READ, INVENTORY_WRITE } from '../access.js';
import { listAlerts, listBatches, postMovement, stockByMedicine, StockError } from '../controllers/stock.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { cleanText, escapeRegex } from '../validate.js';

const router = Router();
router.use(requireAuth);

function sendError(res, error) {
  if (error instanceof StockError) return res.status(error.status).json({ message: error.message });
  throw error;
}

router.get('/stock', requireRole(...INVENTORY_READ), async (req, res) => {
  const rows = await stockByMedicine();
  const q = cleanText(req.query.q, 80).toLowerCase();
  const low = req.query.low === 'true';
  const shown = rows.filter((row) => {
    if (low && !row.low) return false;
    if (!q) return true;
    return [row.medicineName, row.medicineCode, row.strength, row.form].join(' ').toLowerCase().includes(q);
  });
  res.json({ stock: shown });
});

router.get('/batches', requireRole(...INVENTORY_READ), async (req, res) => {
  res.json({ batches: await listBatches(req.query) });
});

router.get('/alerts', requireRole(...INVENTORY_READ), async (_req, res) => {
  res.json(await listAlerts());
});

router.get('/movements', requireRole(...INVENTORY_READ), async (req, res) => {
  const filter = {};
  const type = cleanText(req.query.type, 40);
  if (type) filter.type = type;
  if (req.query.medicine && /^[a-f\d]{24}$/i.test(String(req.query.medicine))) filter.medicine = req.query.medicine;
  const q = cleanText(req.query.q, 80);
  if (q) filter.medicineName = new RegExp(escapeRegex(q), 'i');
  const records = await StockMovement.find(filter).sort({ createdAt: -1 }).limit(100);
  res.json({ movements: records.map(presentMovement) });
});

router.post('/movements', requireRole(...INVENTORY_WRITE), async (req, res) => {
  try {
    const result = await postMovement(req.body, req.user);
    const movement = presentMovement(result.movement);
    res.status(result.replay ? 200 : 201).json({ ...movement, replay: Boolean(result.replay) });
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
