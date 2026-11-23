import { Router } from 'express';
import mongoose from 'mongoose';
import Patient from '../models/Patient.js';
import Medicine from '../models/Medicine.js';
import User from '../models/User.js';
import { DASHBOARD_READ } from '../access.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = Router();
const DAY_MS = 24 * 60 * 60 * 1000;
const NUMBER_TYPES = ['int', 'long', 'double', 'decimal'];

function startOfUtcDay(date) {
  const day = new Date(date);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

function dayKey(date) {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

function fillDays(rows) {
  const counts = new Map(rows.map((row) => [row._id, row.count]));
  const start = startOfUtcDay(new Date(Date.now() - 13 * DAY_MS));
  const series = [];
  for (let offset = 0; offset < 14; offset += 1) {
    const date = dayKey(new Date(start.getTime() + offset * DAY_MS));
    series.push({ date, count: counts.get(date) || 0 });
  }
  return series;
}

function isNumber(field) {
  return { $in: [{ $type: field }, NUMBER_TYPES] };
}

const hasCost = {
  $and: [isNumber('$quantity'), isNumber('$unitCost'), { $gte: ['$quantity', 0] }, { $gte: ['$unitCost', 0] }],
};
const isLow = {
  $and: [isNumber('$quantity'), isNumber('$reorderLevel'), { $lte: ['$quantity', '$reorderLevel'] }],
};

function text(value) {
  const cleaned = String(value ?? '').trim();
  return cleaned;
}

router.get('/', requireAuth, requireRole(...DASHBOARD_READ), async (_req, res) => {
  const since = startOfUtcDay(new Date(Date.now() - 13 * DAY_MS));
  const expiryLimit = new Date(Date.now() + 30 * DAY_MS);
  const isExpiring = {
    $and: [{ $eq: [{ $type: '$expiresAt' }, 'date'] }, { $lte: ['$expiresAt', expiryLimit] }],
  };
  const db = mongoose.connection.db;

  const [patientReport, medicineReport, doctors, suppliers, movements, investigations, pendingAlerts] = await Promise.all([
    Patient.aggregate([
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                patients: { $sum: 1 },
                consultations: { $sum: { $size: { $ifNull: ['$visits', []] } } },
                prescriptions: {
                  $sum: {
                    $reduce: {
                      input: { $ifNull: ['$visits', []] },
                      initialValue: 0,
                      in: { $add: ['$$value', { $size: { $ifNull: ['$$this.treatments', []] } }] },
                    },
                  },
                },
              },
            },
          ],
          recentPatients: [
            { $sort: { createdAt: -1 } },
            { $limit: 6 },
            { $project: { name: 1, age: 1, createdAt: 1 } },
          ],
          recentConsultations: [
            { $unwind: '$visits' },
            { $sort: { 'visits.visitedAt': -1 } },
            { $limit: 6 },
            {
              $project: {
                name: 1,
                visitedAt: '$visits.visitedAt',
                treatmentCount: { $size: { $ifNull: ['$visits.treatments', []] } },
              },
            },
          ],
          consultationActivity: [
            { $unwind: '$visits' },
            { $match: { 'visits.visitedAt': { $gte: since } } },
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$visits.visitedAt', timezone: 'UTC' } },
                count: { $sum: 1 },
              },
            },
          ],
          prescriptionActivity: [
            { $unwind: '$visits' },
            { $unwind: '$visits.treatments' },
            { $match: { 'visits.treatments.recordedAt': { $gte: since } } },
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$visits.treatments.recordedAt', timezone: 'UTC' } },
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
    ]),
    Medicine.aggregate([
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                medicines: { $sum: 1 },
                costRecords: { $sum: { $cond: [hasCost, 1, 0] } },
                stockValue: { $sum: { $cond: [hasCost, { $multiply: ['$quantity', '$unitCost'] }, 0] } },
                levelRecords: { $sum: { $cond: [{ $and: [isNumber('$quantity'), isNumber('$reorderLevel')] }, 1, 0] } },
                lowStock: { $sum: { $cond: [isLow, 1, 0] } },
                expiryRecords: { $sum: { $cond: [{ $eq: [{ $type: '$expiresAt' }, 'date'] }, 1, 0] } },
                expiring: { $sum: { $cond: [isExpiring, 1, 0] } },
              },
            },
          ],
          lowStock: [
            { $match: { $expr: isLow } },
            { $sort: { quantity: 1, name: 1 } },
            { $limit: 6 },
            { $project: { name: 1, strength: 1, form: 1, quantity: 1, reorderLevel: 1 } },
          ],
          expiring: [
            { $match: { $expr: isExpiring } },
            { $sort: { expiresAt: 1, name: 1 } },
            { $limit: 6 },
            { $project: { name: 1, strength: 1, form: 1, expiresAt: 1 } },
          ],
        },
      },
    ]),
    User.countDocuments({ role: { $in: ['DOCTOR', 'doctor'] }, active: { $ne: false } }),
    db.collection('suppliers').countDocuments(),
    db.collection('stockmovements').find({}).sort({ createdAt: -1 }).limit(6).toArray(),
    db.collection('investigations').find({ status: { $in: ['pending', 'open'] } }).sort({ createdAt: -1 }).limit(6).toArray(),
    db.collection('inventoryalerts').countDocuments({ status: { $in: ['pending', 'open'] } }),
  ]);

  const patients = patientReport[0] || {};
  const totals = patients.totals?.[0] || { patients: 0, consultations: 0, prescriptions: 0 };
  const stock = medicineReport[0]?.totals?.[0] || {
    medicines: 0,
    costRecords: 0,
    stockValue: 0,
    levelRecords: 0,
    lowStock: 0,
    expiryRecords: 0,
    expiring: 0,
  };
  const stockValue = stock.costRecords > 0 ? stock.stockValue : null;
  const lowStock = stock.levelRecords > 0 ? stock.lowStock : null;
  const expiring = stock.expiryRecords > 0 ? stock.expiring : null;

  res.json({
    cards: {
      doctors,
      patients: totals.patients,
      consultations: totals.consultations,
      prescriptions: totals.prescriptions,
      medicines: stock.medicines,
      suppliers,
      stockValue,
      lowStock,
      expiring,
      pendingAlerts,
    },
    tracking: {
      stockValue: stock.costRecords > 0,
      lowStock: stock.levelRecords > 0,
      expiring: stock.expiryRecords > 0,
    },
    consultationActivity: fillDays(patients.consultationActivity || []),
    prescriptionActivity: fillDays(patients.prescriptionActivity || []),
    recentPatients: patients.recentPatients || [],
    recentConsultations: patients.recentConsultations || [],
    lowStock: medicineReport[0]?.lowStock || [],
    expiring: medicineReport[0]?.expiring || [],
    stockMovements: movements.map((item) => ({
      _id: item._id,
      at: item.createdAt || item.movedAt || null,
      medicineName: text(item.medicineName || item.name),
      type: text(item.type || item.movementType),
      quantity: typeof item.quantity === 'number' ? item.quantity : null,
    })),
    investigations: investigations.map((item) => ({
      _id: item._id,
      at: item.createdAt || null,
      title: text(item.title || item.summary || item.reason),
      status: text(item.status),
    })),
  });
});

export default router;
