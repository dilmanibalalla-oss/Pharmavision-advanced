import { Router } from 'express';
import mongoose from 'mongoose';
import Patient from '../models/Patient.js';
import Dispensing, { PrescriptionFill, presentDispensing } from '../models/Dispensing.js';
import { DISPENSE_READ } from '../access.js';
import { dispense, planFefo, StockError } from '../controllers/stock.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { recordAudit } from '../audit.js';
import { cleanText, escapeRegex } from '../validate.js';

const router = Router();
router.use(requireAuth, requireRole(...DISPENSE_READ));

function sendError(res, error) {
  if (error instanceof StockError) return res.status(error.status).json({ message: error.message });
  throw error;
}

router.get('/prescriptions', async (req, res) => {
  const q = cleanText(req.query.q, 80);
  const filter = { 'visits.treatments.0': { $exists: true } };
  if (q && mongoose.isValidObjectId(q)) {
    filter['visits.treatments._id'] = q;
  } else if (q) {
    const regex = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: regex }, { patientCode: regex }, { 'visits.treatments.medicineName': regex }];
  }
  const patients = await Patient.find(filter).select('name patientCode visits').limit(40);
  const lineIds = [];
  const rows = [];
  for (const patient of patients) {
    for (const visit of patient.visits || []) {
      for (const line of visit.treatments || []) {
        if (q && mongoose.isValidObjectId(q) && String(line._id) !== q) continue;
        lineIds.push(line._id);
        rows.push({ patient, visit, line });
      }
    }
  }
  const fills = await PrescriptionFill.find({ prescription: { $in: lineIds } });
  const byLine = new Map(fills.map((fill) => [String(fill.prescription), fill]));
  const prescriptions = rows.map(({ patient, visit, line }) => {
    const fill = byLine.get(String(line._id));
    const prescribed = fill?.prescribedQuantity || (Number.isInteger(line.quantity) ? line.quantity : null);
    const dispensed = fill?.dispensedQuantity || 0;
    return {
      _id: line._id,
      patient: patient._id,
      patientName: patient.name,
      patientCode: patient.patientCode || '',
      medicine: line.medicine,
      medicineName: line.medicineName,
      strength: line.strength || '',
      form: line.form || '',
      notes: line.notes || '',
      prescribedQuantity: prescribed,
      dispensedQuantity: dispensed,
      remainingQuantity: prescribed == null ? null : Math.max(0, prescribed - dispensed),
      status: prescribed == null ? 'OPEN' : dispensed >= prescribed ? 'COMPLETED' : dispensed > 0 ? 'PARTIAL' : 'OPEN',
      visitedAt: visit.visitedAt,
    };
  });
  res.json({ prescriptions });
});

router.get('/plan', async (req, res) => {
  if (!mongoose.isValidObjectId(req.query.medicine)) {
    return res.status(400).json({ message: 'Choose a medicine' });
  }
  try {
    res.json(await planFefo(req.query.medicine, req.query.quantity));
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/history', async (req, res) => {
  const filter = {};
  if (mongoose.isValidObjectId(req.query.patient)) filter.patient = req.query.patient;
  if (mongoose.isValidObjectId(req.query.prescription)) filter.prescription = req.query.prescription;
  const q = cleanText(req.query.q, 80);
  if (q) filter.patientName = new RegExp(escapeRegex(q), 'i');
  const records = await Dispensing.find({ ...filter, status: 'posted' }).sort({ createdAt: -1 }).limit(50);
  res.json({ dispensings: records.map(presentDispensing) });
});

router.post('/', async (req, res) => {
  try {
    const result = await dispense(req.body, req.user);
    if (!result.replay) {
      await recordAudit(req, { action: 'dispensing', entityType: 'dispensing', entityId: result._id, summary: 'Medicine dispensed' });
    }
    res.status(result.replay ? 200 : 201).json(result);
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
