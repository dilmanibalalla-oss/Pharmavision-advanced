import Patient from './models/Patient.js';
import User from './models/User.js';
import Consultation from './models/Consultation.js';
import TreatmentPlan from './models/TreatmentPlan.js';
import Dispensing from './models/Dispensing.js';
import Batch from './models/Batch.js';
import PurchaseOrder from './models/PurchaseOrder.js';
import StockMovement from './models/StockMovement.js';
import Medicine from './models/Medicine.js';
import Scan from './models/Scan.js';
import Discrepancy from './models/Discrepancy.js';
import AuditLog from './models/AuditLog.js';
import { DOCTOR_STORED_ROLES } from './access.js';
import { escapeRegex } from './validate.js';

export const REPORTS = [
  { key: 'patients', title: 'Patient registration', group: 'Clinic', roles: ['ADMIN', 'SECURITY_OFFICER'] },
  { key: 'doctors', title: 'Doctor activity', group: 'Clinic', roles: ['ADMIN', 'SECURITY_OFFICER'] },
  { key: 'consultations', title: 'Consultations', group: 'Clinic', roles: ['ADMIN', 'DOCTOR'] },
  { key: 'treatments', title: 'Treatments', group: 'Clinic', roles: ['ADMIN', 'DOCTOR'] },
  { key: 'prescriptions', title: 'Prescriptions', group: 'Clinic', roles: ['ADMIN', 'DOCTOR', 'PHARMACIST'] },
  { key: 'dispensing', title: 'Medicine dispensing', group: 'Pharmacy', roles: ['ADMIN', 'PHARMACIST'] },
  { key: 'inventory', title: 'Medicine inventory', group: 'Pharmacy', roles: ['ADMIN', 'INVENTORY_MANAGER', 'PHARMACIST'] },
  { key: 'purchases', title: 'Supplier purchases', group: 'Pharmacy', roles: ['ADMIN', 'INVENTORY_MANAGER', 'PHARMACIST'] },
  { key: 'movements', title: 'Stock movements', group: 'Pharmacy', roles: ['ADMIN', 'INVENTORY_MANAGER', 'PHARMACIST'] },
  { key: 'expiry', title: 'Expiry', group: 'Pharmacy', roles: ['ADMIN', 'INVENTORY_MANAGER', 'PHARMACIST'] },
  { key: 'low-stock', title: 'Low stock', group: 'Pharmacy', roles: ['ADMIN', 'INVENTORY_MANAGER', 'PHARMACIST'] },
  { key: 'shelf-scans', title: 'AR shelf scans', group: 'Vision', roles: ['ADMIN', 'INVENTORY_MANAGER', 'SECURITY_OFFICER'] },
  { key: 'detections', title: 'AI detections', group: 'Vision', roles: ['ADMIN', 'INVENTORY_MANAGER', 'SECURITY_OFFICER'] },
  { key: 'discrepancies', title: 'Inventory discrepancies', group: 'Vision', roles: ['ADMIN', 'SECURITY_OFFICER', 'INVENTORY_MANAGER'] },
  { key: 'activity', title: 'User activity', group: 'Security', roles: ['ADMIN', 'SECURITY_OFFICER'] },
];

export function reportFor(key) {
  return REPORTS.find((item) => item.key === key) || null;
}

function range(from, to) {
  return { $gte: from, $lte: to };
}

function like(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  return new RegExp(escapeRegex(text).slice(0, 80), 'i');
}

function stamp(value) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

export async function buildReport(key, { from, to, q, sort, dir, page, limit }) {
  const search = like(q);
  const order = dir === 'asc' ? 1 : -1;
  const builders = {
    patients: () => patientsReport({ from, to, search, sort, order, page, limit }),
    doctors: () => doctorsReport({ from, to, search, sort, order, page, limit }),
    consultations: () => consultationsReport({ from, to, search, sort, order, page, limit }),
    treatments: () => treatmentsReport({ from, to, search, sort, order, page, limit }),
    prescriptions: () => prescriptionsReport({ from, to, search, sort, order, page, limit }),
    dispensing: () => dispensingReport({ from, to, search, sort, order, page, limit }),
    inventory: () => inventoryReport({ search, sort, order, page, limit }),
    purchases: () => purchasesReport({ from, to, search, sort, order, page, limit }),
    movements: () => movementsReport({ from, to, search, sort, order, page, limit }),
    expiry: () => expiryReport({ from, to, search, sort, order, page, limit }),
    'low-stock': () => lowStockReport({ search, page, limit }),
    'shelf-scans': () => scansReport({ from, to, search, sort, order, page, limit }),
    detections: () => detectionsReport({ from, to, search, page, limit }),
    discrepancies: () => discrepancyReport({ from, to, search, sort, order, page, limit }),
    activity: () => activityReport({ from, to, search, sort, order, page, limit }),
  };
  return builders[key]();
}

async function pageOf(model, filter, sort, page, limit, map, summary) {
  const [total, records] = await Promise.all([
    model.countDocuments(filter),
    model.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
  ]);
  const rows = records.map(map);
  return {
    columns: summary.columns,
    rows,
    total,
    page,
    pages: total === 0 ? 0 : Math.ceil(total / limit),
    summary: { ...(await summary.cards(filter)), series: await summary.series(filter) },
  };
}

function patientsReport(options) {
  const filter = { registeredAt: range(options.from, options.to) };
  if (options.search) filter.patientCode = options.search;
  const sortField = options.sort === 'visits' ? 'visitCount' : 'registeredAt';
  return pageOf(Patient, filter, { [sortField]: options.order }, options.page, options.limit, (row) => ({
    patientCode: row.patientCode || '',
    gender: row.gender || '',
    registeredAt: stamp(row.registeredAt),
    visitCount: row.visitCount || 0,
    active: row.active === false ? 'Inactive' : 'Active',
  }), {
    columns: [
      { key: 'patientCode', label: 'Patient ID' },
      { key: 'gender', label: 'Gender' },
      { key: 'registeredAt', label: 'Registered' },
      { key: 'visitCount', label: 'Visits' },
      { key: 'active', label: 'Status' },
    ],
    cards: async (current) => ({ registrations: await Patient.countDocuments(current) }),
    series: async (current) => {
      const rows = await Patient.aggregate([
        { $match: current },
        { $group: { _id: '$gender', value: { $sum: 1 } } },
      ]);
      return rows.map((row) => ({ label: row._id || 'Not recorded', value: row.value }));
    },
  });
}

function doctorsReport(options) {
  const filter = { role: { $in: DOCTOR_STORED_ROLES }, createdAt: range(options.from, options.to) };
  if (options.search) filter.name = options.search;
  return pageOf(User, filter, { name: options.order }, options.page, options.limit, (row) => ({
    name: row.name,
    specialization: row.specialization || '',
    active: row.active === false ? 'Inactive' : 'Active',
    since: stamp(row.createdAt),
  }), {
    columns: [
      { key: 'name', label: 'Doctor' },
      { key: 'specialization', label: 'Specialization' },
      { key: 'active', label: 'Status' },
      { key: 'since', label: 'Since' },
    ],
    cards: async (current) => ({ doctors: await User.countDocuments(current) }),
    series: async (current) => {
      const rows = await Consultation.aggregate([
        { $match: { consultedAt: range(options.from, options.to) } },
        { $group: { _id: '$doctorName', value: { $sum: 1 } } },
        { $sort: { value: -1 } },
        { $limit: 8 },
      ]);
      return rows.map((row) => ({ label: row._id || 'Doctor', value: row.value }));
    },
  });
}

function consultationsReport(options) {
  const filter = { consultedAt: range(options.from, options.to) };
  if (options.search) filter.doctorName = options.search;
  return pageOf(Consultation, filter, { consultedAt: options.order }, options.page, options.limit, (row) => ({
    date: stamp(row.consultedAt),
    patientCode: row.patientCode || '',
    doctor: row.doctorName,
  }), {
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'patientCode', label: 'Patient ID' },
      { key: 'doctor', label: 'Doctor' },
    ],
    cards: async (current) => ({ consultations: await Consultation.countDocuments(current) }),
    series: async (current) => {
      const rows = await Consultation.aggregate([
        { $match: current },
        { $group: { _id: '$doctorName', value: { $sum: 1 } } },
        { $sort: { value: -1 } },
        { $limit: 8 },
      ]);
      return rows.map((row) => ({ label: row._id || 'Doctor', value: row.value }));
    },
  });
}

function treatmentsReport(options) {
  const filter = { createdAt: range(options.from, options.to) };
  if (options.search) filter.patientCode = options.search;
  return pageOf(TreatmentPlan, filter, { createdAt: options.order }, options.page, options.limit, (row) => ({
    date: stamp(row.createdAt),
    patientCode: row.patientCode || '',
    doctor: row.doctorName || '',
    status: row.status,
    followUp: stamp(row.followUpDate),
  }), {
    columns: [
      { key: 'date', label: 'Opened' },
      { key: 'patientCode', label: 'Patient ID' },
      { key: 'doctor', label: 'Doctor' },
      { key: 'status', label: 'Status' },
      { key: 'followUp', label: 'Follow-up' },
    ],
    cards: async (current) => ({ plans: await TreatmentPlan.countDocuments(current) }),
    series: async (current) => {
      const rows = await TreatmentPlan.aggregate([
        { $match: current },
        { $group: { _id: '$status', value: { $sum: 1 } } },
      ]);
      return rows.map((row) => ({ label: row._id, value: row.value }));
    },
  });
}

async function prescriptionsReport(options) {
  const match = { 'visits.treatments.recordedAt': range(options.from, options.to) };
  const pipeline = [
    { $unwind: '$visits' },
    { $unwind: '$visits.treatments' },
    { $match: match },
  ];
  if (options.search) pipeline.push({ $match: { 'visits.treatments.medicineName': options.search } });
  const [countRow, records] = await Promise.all([
    Patient.aggregate([...pipeline, { $count: 'total' }]),
    Patient.aggregate([
      ...pipeline,
      { $sort: { 'visits.treatments.recordedAt': options.order } },
      { $skip: (options.page - 1) * options.limit },
      { $limit: options.limit },
    ]),
  ]);
  const total = countRow[0]?.total || 0;
  const grouped = await Patient.aggregate([
    ...pipeline,
    { $group: { _id: '$visits.treatments.medicineName', value: { $sum: 1 } } },
    { $sort: { value: -1 } },
    { $limit: 8 },
  ]);
  return {
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'patientCode', label: 'Patient ID' },
      { key: 'medicine', label: 'Medicine' },
      { key: 'quantity', label: 'Quantity' },
    ],
    rows: records.map((row) => ({
      date: stamp(row.visits.treatments.recordedAt),
      patientCode: row.patientCode || '',
      medicine: row.visits.treatments.medicineName,
      quantity: row.visits.treatments.quantity || '',
    })),
    total,
    page: options.page,
    pages: total === 0 ? 0 : Math.ceil(total / options.limit),
    summary: {
      prescriptions: total,
      series: grouped.map((row) => ({ label: row._id || 'Medicine', value: row.value })),
    },
  };
}

function dispensingReport(options) {
  const filter = { status: 'posted', createdAt: range(options.from, options.to) };
  if (options.search) filter.medicineName = options.search;
  return pageOf(Dispensing, filter, { createdAt: options.order }, options.page, options.limit, (row) => ({
    date: stamp(row.createdAt),
    patientCode: row.patientCode || '',
    medicine: row.medicineName,
    quantity: row.quantity,
    pharmacist: row.pharmacistName,
    status: row.fillStatus,
  }), {
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'patientCode', label: 'Patient ID' },
      { key: 'medicine', label: 'Medicine' },
      { key: 'quantity', label: 'Quantity' },
      { key: 'pharmacist', label: 'Pharmacist' },
      { key: 'status', label: 'Fill' },
    ],
    cards: async (current) => ({ dispensings: await Dispensing.countDocuments(current) }),
    series: async (current) => {
      const rows = await Dispensing.aggregate([
        { $match: current },
        { $group: { _id: '$medicineName', value: { $sum: '$quantity' } } },
        { $sort: { value: -1 } },
        { $limit: 8 },
      ]);
      return rows.map((row) => ({ label: row._id, value: row.value }));
    },
  });
}

async function inventoryReport(options) {
  const rows = await Batch.aggregate([
    { $match: { remainingQuantity: { $gt: 0 } } },
    { $group: { _id: '$medicine', onHand: { $sum: '$remainingQuantity' }, batches: { $sum: 1 } } },
  ]);
  const medicines = await Medicine.find({ _id: { $in: rows.map((row) => row._id) } }).select('name medicineCode strength form');
  const byId = new Map(medicines.map((item) => [String(item._id), item]));
  let list = rows.map((row) => {
    const medicine = byId.get(String(row._id));
    return {
      medicineCode: medicine?.medicineCode || '',
      medicine: medicine?.name || '',
      strength: medicine?.strength || '',
      onHand: row.onHand,
      batches: row.batches,
    };
  });
  if (options.search) list = list.filter((row) => options.search.test(row.medicine) || options.search.test(row.medicineCode));
  list.sort((left, right) => (options.order === 1 ? left.onHand - right.onHand : right.onHand - left.onHand));
  const total = list.length;
  const slice = list.slice((options.page - 1) * options.limit, options.page * options.limit);
  return {
    columns: [
      { key: 'medicineCode', label: 'Medicine ID' },
      { key: 'medicine', label: 'Medicine' },
      { key: 'strength', label: 'Strength' },
      { key: 'onHand', label: 'On hand' },
      { key: 'batches', label: 'Batches' },
    ],
    rows: slice,
    total,
    page: options.page,
    pages: total === 0 ? 0 : Math.ceil(total / options.limit),
    summary: {
      medicines: total,
      units: list.reduce((sum, row) => sum + row.onHand, 0),
      series: slice.map((row) => ({ label: row.medicine, value: row.onHand })),
    },
  };
}

function purchasesReport(options) {
  const filter = { orderDate: range(options.from, options.to) };
  if (options.search) filter.supplierName = options.search;
  return pageOf(PurchaseOrder, filter, { orderDate: options.order }, options.page, options.limit, (row) => ({
    orderCode: row.orderCode || '',
    supplier: row.supplierName,
    date: stamp(row.orderDate),
    total: row.totalAmount,
    status: row.status,
  }), {
    columns: [
      { key: 'orderCode', label: 'Order' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'date', label: 'Date' },
      { key: 'total', label: 'Total' },
      { key: 'status', label: 'Status' },
    ],
    cards: async (current) => ({ orders: await PurchaseOrder.countDocuments(current) }),
    series: async (current) => {
      const rows = await PurchaseOrder.aggregate([
        { $match: current },
        { $group: { _id: '$status', value: { $sum: 1 } } },
      ]);
      return rows.map((row) => ({ label: row._id, value: row.value }));
    },
  });
}

function movementsReport(options) {
  const filter = { createdAt: range(options.from, options.to) };
  if (options.search) filter.medicineName = options.search;
  return pageOf(StockMovement, filter, { createdAt: options.order }, options.page, options.limit, (row) => ({
    date: stamp(row.createdAt),
    type: row.type,
    medicine: row.medicineName,
    batch: row.batchNumber,
    quantity: row.quantity,
    direction: row.direction,
    user: row.userName,
  }), {
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'type', label: 'Type' },
      { key: 'medicine', label: 'Medicine' },
      { key: 'batch', label: 'Batch' },
      { key: 'quantity', label: 'Quantity' },
      { key: 'direction', label: 'Direction' },
      { key: 'user', label: 'Recorded by' },
    ],
    cards: async (current) => ({ movements: await StockMovement.countDocuments(current) }),
    series: async (current) => {
      const rows = await StockMovement.aggregate([
        { $match: current },
        { $group: { _id: '$type', value: { $sum: 1 } } },
      ]);
      return rows.map((row) => ({ label: row._id, value: row.value }));
    },
  });
}

function expiryReport(options) {
  const filter = { expiryDate: range(options.from, options.to), remainingQuantity: { $gt: 0 } };
  if (options.search) filter.medicineName = options.search;
  return pageOf(Batch, filter, { expiryDate: options.order }, options.page, options.limit, (row) => ({
    medicine: row.medicineName,
    batch: row.batchNumber,
    expiry: stamp(row.expiryDate),
    remaining: row.remainingQuantity,
    location: row.storageLocation,
  }), {
    columns: [
      { key: 'medicine', label: 'Medicine' },
      { key: 'batch', label: 'Batch' },
      { key: 'expiry', label: 'Expiry' },
      { key: 'remaining', label: 'Remaining' },
      { key: 'location', label: 'Location' },
    ],
    cards: async (current) => ({ batches: await Batch.countDocuments(current) }),
    series: async (current) => {
      const rows = await Batch.find(current).sort({ expiryDate: 1 }).limit(8);
      return rows.map((row) => ({ label: row.batchNumber, value: row.remainingQuantity }));
    },
  });
}

async function lowStockReport(options) {
  const stock = await Batch.aggregate([
    { $match: { remainingQuantity: { $gt: 0 } } },
    { $group: { _id: '$medicine', onHand: { $sum: '$remainingQuantity' } } },
  ]);
  const onHand = new Map(stock.map((row) => [String(row._id), row.onHand]));
  const medicines = await Medicine.find({ active: { $ne: false }, minimumStock: { $gt: 0 } })
    .select('name medicineCode minimumStock');
  let list = medicines
    .map((medicine) => ({
      medicineCode: medicine.medicineCode || '',
      medicine: medicine.name,
      minimum: medicine.minimumStock,
      onHand: onHand.get(String(medicine._id)) || 0,
    }))
    .filter((row) => row.onHand <= row.minimum);
  if (options.search) list = list.filter((row) => options.search.test(row.medicine));
  const total = list.length;
  return {
    columns: [
      { key: 'medicineCode', label: 'Medicine ID' },
      { key: 'medicine', label: 'Medicine' },
      { key: 'onHand', label: 'On hand' },
      { key: 'minimum', label: 'Minimum' },
    ],
    rows: list.slice((options.page - 1) * options.limit, options.page * options.limit),
    total,
    page: options.page,
    pages: total === 0 ? 0 : Math.ceil(total / options.limit),
    summary: {
      low: total,
      series: list.slice(0, 8).map((row) => ({ label: row.medicine, value: row.onHand })),
    },
  };
}

function scansReport(options) {
  const filter = { createdAt: range(options.from, options.to) };
  if (options.search) filter.shelfName = options.search;
  return pageOf(Scan, filter, { createdAt: options.order }, options.page, options.limit, (row) => ({
    date: stamp(row.createdAt),
    scanCode: row.scanCode || '',
    shelf: row.shelfName,
    status: row.status,
    recognized: row.recognition?.performed ? 'Yes' : 'No',
    observations: (row.observations || []).length,
  }), {
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'scanCode', label: 'Scan' },
      { key: 'shelf', label: 'Shelf' },
      { key: 'status', label: 'Status' },
      { key: 'recognized', label: 'Recognized' },
      { key: 'observations', label: 'Observations' },
    ],
    cards: async (current) => {
      const [scans, shelves] = await Promise.all([
        Scan.countDocuments(current),
        Scan.distinct('shelf', current),
      ]);
      return { scans, shelves: shelves.length };
    },
    series: async (current) => {
      const rows = await Scan.aggregate([
        { $match: current },
        { $group: { _id: '$status', value: { $sum: 1 } } },
      ]);
      return rows.map((row) => ({ label: row._id, value: row.value }));
    },
  });
}

async function detectionsReport(options) {
  const scans = await Scan.find({ createdAt: range(options.from, options.to), 'observations.0': { $exists: true } });
  let rows = scans.flatMap((scan) => (scan.observations || []).map((item) => ({
    date: stamp(scan.createdAt),
    shelf: scan.shelfName,
    label: item.unknown ? item.label : item.medicineName,
    count: item.count,
    confidence: item.confidence,
    unknown: item.unknown ? 'Unknown' : 'Matched',
    lowConfidence: item.lowConfidence ? 'Low' : 'Usable',
  })));
  if (options.search) rows = rows.filter((row) => options.search.test(row.label) || options.search.test(row.shelf));
  const total = rows.length;
  return {
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'shelf', label: 'Shelf' },
      { key: 'label', label: 'Product' },
      { key: 'count', label: 'Count' },
      { key: 'confidence', label: 'Confidence' },
      { key: 'unknown', label: 'Match' },
      { key: 'lowConfidence', label: 'Confidence band' },
    ],
    rows: rows.slice((options.page - 1) * options.limit, options.page * options.limit),
    total,
    page: options.page,
    pages: total === 0 ? 0 : Math.ceil(total / options.limit),
    summary: {
      detections: total,
      unknown: rows.filter((row) => row.unknown === 'Unknown').length,
      series: [
        { label: 'Matched', value: rows.filter((row) => row.unknown === 'Matched').length },
        { label: 'Unknown', value: rows.filter((row) => row.unknown === 'Unknown').length },
      ],
    },
  };
}

function discrepancyReport(options) {
  const filter = { detectedAt: range(options.from, options.to) };
  if (options.search) filter.shelfName = options.search;
  return pageOf(Discrepancy, filter, { detectedAt: options.order }, options.page, options.limit, (row) => ({
    date: stamp(row.detectedAt),
    alertCode: row.alertCode || '',
    shelf: row.shelfName,
    medicine: row.medicineName || 'Unrecognized product',
    expected: row.expectedQuantity,
    observed: row.observedQuantity,
    difference: row.difference,
    status: row.status,
  }), {
    columns: [
      { key: 'date', label: 'Detected' },
      { key: 'alertCode', label: 'Alert' },
      { key: 'shelf', label: 'Shelf' },
      { key: 'medicine', label: 'Medicine' },
      { key: 'expected', label: 'Expected' },
      { key: 'observed', label: 'Observed' },
      { key: 'difference', label: 'Difference' },
      { key: 'status', label: 'Status' },
    ],
    cards: async (current) => ({ alerts: await Discrepancy.countDocuments(current) }),
    series: async (current) => {
      const rows = await Discrepancy.aggregate([
        { $match: current },
        { $group: { _id: '$status', value: { $sum: 1 } } },
      ]);
      return rows.map((row) => ({ label: row._id, value: row.value }));
    },
  });
}

function activityReport(options) {
  const filter = { createdAt: range(options.from, options.to) };
  if (options.search) filter.action = options.search;
  return pageOf(AuditLog, filter, { createdAt: options.order }, options.page, options.limit, (row) => ({
    date: stamp(row.createdAt),
    user: row.userName || '',
    role: row.role || '',
    action: row.action,
    entity: row.entityType || '',
    summary: row.summary || '',
  }), {
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'user', label: 'User' },
      { key: 'role', label: 'Role' },
      { key: 'action', label: 'Action' },
      { key: 'entity', label: 'Record' },
      { key: 'summary', label: 'Summary' },
    ],
    cards: async (current) => ({ events: await AuditLog.countDocuments(current) }),
    series: async (current) => {
      const rows = await AuditLog.aggregate([
        { $match: current },
        { $group: { _id: '$action', value: { $sum: 1 } } },
        { $sort: { value: -1 } },
        { $limit: 8 },
      ]);
      return rows.map((row) => ({ label: row._id, value: row.value }));
    },
  });
}
