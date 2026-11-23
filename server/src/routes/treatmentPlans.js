import { Router } from 'express';
import mongoose from 'mongoose';
import Patient from '../models/Patient.js';
import User from '../models/User.js';
import Consultation from '../models/Consultation.js';
import TreatmentPlan, { presentTreatmentPlan } from '../models/TreatmentPlan.js';
import {
  DOCTOR_STORED_ROLES,
  TREATMENT_READ,
  TREATMENT_WRITE,
  canonicalRole,
} from '../access.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  TREATMENT_STATUSES,
  cleanText,
  escapeRegex,
  parsePlanDate,
} from '../validate.js';

const router = Router();
const TEXT_FIELDS = [
  ['diagnosis', 500],
  ['instructions', 2000],
];

router.use(requireAuth);

function pageNumber(value) {
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1) return 1;
  return page;
}

function pageLimit(value) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) return 20;
  return Math.min(limit, 50);
}

function has(body, key) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function canRevise(user, plan) {
  if (canonicalRole(user.role) === 'ADMIN') return true;
  return String(plan.doctor) === String(user._id);
}

function sameDate(left, right) {
  const first = left ? new Date(left).toISOString() : '';
  const second = right ? new Date(right).toISOString() : '';
  return first === second;
}

function chartLines(patient) {
  const lines = [];
  for (const visit of patient.visits || []) {
    for (const item of visit.treatments || []) {
      lines.push({
        prescription: item._id,
        medicineName: item.medicineName,
        strength: item.strength || '',
        form: item.form || '',
        recordedAt: item.recordedAt || visit.visitedAt,
      });
    }
  }
  return lines;
}

async function linkedRecords(body, user, current) {
  let patientId = body.patient || current?.patient;
  if (current && canonicalRole(user.role) !== 'ADMIN') patientId = current.patient;
  if (!mongoose.isValidObjectId(patientId)) return { error: 'Choose a patient' };
  const patient = await Patient.findById(patientId).select('name patientCode active visits');
  if (!patient) return { error: 'Patient not found' };

  let doctorId = body.doctor;
  if (canonicalRole(user.role) !== 'ADMIN') doctorId = user._id;
  else if (!doctorId) doctorId = current?.doctor;
  if (!mongoose.isValidObjectId(doctorId)) return { error: 'Choose a doctor' };
  const doctor = await User.findOne({
    _id: doctorId,
    role: { $in: DOCTOR_STORED_ROLES },
  }).select('name active role');
  if (!doctor) return { error: 'Choose a doctor' };
  if (doctor.active === false) return { error: 'That doctor account is inactive' };

  return { patient, doctor };
}

async function linkedConsultation(body, patientId, current) {
  if (current && !has(body, 'consultation')) return { consultationId: current.consultation || null };
  const id = body.consultation;
  if (!id) return { consultationId: null };
  if (!mongoose.isValidObjectId(id)) return { error: 'Consultation not found' };
  const consultation = await Consultation.findById(id).select('patient');
  if (!consultation) return { error: 'Consultation not found' };
  if (String(consultation.patient) !== String(patientId)) {
    return { error: 'That consultation belongs to a different patient' };
  }
  return { consultationId: consultation._id };
}

function readPlan(body, current) {
  const fields = {};
  if (!current || has(body, 'description')) {
    const description = cleanText(body.description, 2000);
    if (!description) return { error: 'Treatment description is required' };
    fields.description = description;
  }
  for (const [key, max] of TEXT_FIELDS) {
    if (!current || has(body, key)) fields[key] = cleanText(body[key], max);
  }
  if (!current || has(body, 'startDate')) {
    const start = parsePlanDate(body.startDate, 'Start date', true);
    if (start.error) return start;
    fields.startDate = start.date;
  }
  if (!current || has(body, 'endDate')) {
    const end = parsePlanDate(body.endDate, 'End date');
    if (end.error) return end;
    fields.endDate = end.date;
  }
  if (!current || has(body, 'followUpDate')) {
    const follow = parsePlanDate(body.followUpDate, 'Follow-up date');
    if (follow.error) return follow;
    fields.followUpDate = follow.date;
  }
  if (!current || has(body, 'status')) {
    const status = cleanText(body.status, 20) || (current ? '' : 'PLANNED');
    if (!status || !TREATMENT_STATUSES.includes(status)) {
      return { error: 'Status is not one of the listed values' };
    }
    fields.status = status;
  }

  const startDate = fields.startDate || current?.startDate || null;
  const endDate = Object.prototype.hasOwnProperty.call(fields, 'endDate') ? fields.endDate : current?.endDate || null;
  const followUpDate = Object.prototype.hasOwnProperty.call(fields, 'followUpDate')
    ? fields.followUpDate
    : current?.followUpDate || null;
  if (endDate && startDate && endDate < startDate) {
    return { error: 'End date cannot be before the start date' };
  }
  if (followUpDate && startDate && followUpDate < startDate) {
    return { error: 'Follow-up date cannot be before the start date' };
  }
  return { fields };
}

function readPrescriptions(body, patient, current) {
  if (!has(body, 'prescriptions')) return { prescriptions: undefined };
  const ids = Array.isArray(body.prescriptions) ? body.prescriptions : [];
  if (ids.length > 20) return { error: 'A plan can link at most 20 prescriptions' };
  const samePatient = !current || String(current.patient) === String(patient._id);
  const previous = new Map(
    (samePatient ? current?.prescriptions || [] : []).map((item) => [String(item.prescription), item])
  );
  const lines = new Map(chartLines(patient).map((line) => [String(line.prescription), line]));
  const seen = new Set();
  const prescriptions = [];
  for (const id of ids) {
    const key = String(id);
    if (seen.has(key)) continue;
    seen.add(key);
    if (lines.has(key)) prescriptions.push(lines.get(key));
    else if (previous.has(key)) prescriptions.push(previous.get(key));
    else return { error: 'That prescription is not on this patient chart' };
  }
  return { prescriptions };
}

function changedFields(before, after) {
  const fields = [];
  if (String(before.patient) !== String(after.patient)) fields.push('patient');
  if (String(before.doctor) !== String(after.doctor)) fields.push('doctor');
  if (String(before.consultation || '') !== String(after.consultation || '')) fields.push('consultation');
  if ((before.diagnosis || '') !== (after.diagnosis || '')) fields.push('diagnosis');
  if (before.description !== after.description) fields.push('description');
  if ((before.instructions || '') !== (after.instructions || '')) fields.push('instructions');
  if (!sameDate(before.startDate, after.startDate)) fields.push('startDate');
  if (!sameDate(before.endDate, after.endDate)) fields.push('endDate');
  if (!sameDate(before.followUpDate, after.followUpDate)) fields.push('followUpDate');
  if (before.status !== after.status) fields.push('status');
  const left = (before.prescriptions || []).map((item) => String(item._id || item.prescription)).join(',');
  const right = (after.prescriptions || []).map((item) => String(item.prescription || item._id)).join(',');
  if (left !== right) fields.push('prescriptions');
  return fields;
}

function remember(record, user, action, fields) {
  record.audit.push({
    at: new Date(),
    userId: user._id,
    name: user.name,
    action,
    fields,
  });
  if (record.audit.length > 50) record.audit = record.audit.slice(-50);
}

function addProgress(record, user, entry) {
  record.progress.push({
    at: new Date(),
    userId: user._id,
    name: user.name,
    kind: entry.kind,
    note: cleanText(entry.note, 500),
    status: entry.status || record.status,
    followUpDate: entry.followUpDate || null,
  });
  if (record.progress.length > 50) record.progress = record.progress.slice(-50);
}

const BOARD_LIMIT = 8;
const HISTORY_LIMIT = 50;
const OPEN_STATUSES = ['PLANNED', 'ACTIVE', 'ON_HOLD'];

function listFilter(query, options = {}) {
  const filter = {};
  if (mongoose.isValidObjectId(query.patient)) filter.patient = new mongoose.Types.ObjectId(String(query.patient));
  if (mongoose.isValidObjectId(query.doctor)) filter.doctor = new mongoose.Types.ObjectId(String(query.doctor));
  if (mongoose.isValidObjectId(query.consultation)) {
    filter.consultation = new mongoose.Types.ObjectId(String(query.consultation));
  }
  if (!options.ignoreStatus && query.status) {
    const status = cleanText(query.status, 20);
    if (!TREATMENT_STATUSES.includes(status)) return { error: 'Status is not one of the listed values' };
    filter.status = status;
  }
  const from = query.from ? new Date(query.from) : null;
  const to = query.to ? new Date(query.to) : null;
  if (from && !Number.isNaN(from.getTime())) filter.startDate = { ...filter.startDate, $gte: from };
  if (to && !Number.isNaN(to.getTime())) {
    const end = new Date(to);
    if (String(query.to).length <= 10) end.setUTCHours(23, 59, 59, 999);
    filter.startDate = { ...filter.startDate, $lte: end };
  }
  const due = !options.ignoreStatus && (query.due === 'true' || query.due === '1');
  if (due) {
    const end = new Date();
    end.setUTCHours(23, 59, 59, 999);
    filter.followUpDate = { $lte: end };
    if (!filter.status) filter.status = { $in: OPEN_STATUSES };
  }
  const q = cleanText(query.q, 80);
  if (q) {
    const regex = new RegExp(escapeRegex(q), 'i');
    filter.$or = [
      { patientName: regex },
      { patientCode: regex },
      { doctorName: regex },
      { diagnosis: regex },
      { description: regex },
    ];
  }
  return { filter, due };
}

function statusCounts(rows) {
  const counts = Object.fromEntries(TREATMENT_STATUSES.map((status) => [status, 0]));
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(counts, row._id)) counts[row._id] = row.count;
  }
  return counts;
}

router.get('/', requireRole(...TREATMENT_READ), async (req, res) => {
  const page = pageNumber(req.query.page);
  const limit = pageLimit(req.query.limit);
  const parsed = listFilter(req.query);
  if (parsed.error) return res.status(400).json({ message: parsed.error });

  const sort = parsed.due ? { followUpDate: 1, startDate: -1 } : { startDate: -1, createdAt: -1 };
  const [total, records] = await Promise.all([
    TreatmentPlan.countDocuments(parsed.filter),
    TreatmentPlan.find(parsed.filter).sort(sort).skip((page - 1) * limit).limit(limit),
  ]);
  res.json({
    treatmentPlans: records.map((record) => presentTreatmentPlan(record)),
    page,
    limit,
    total,
    pages: total === 0 ? 0 : Math.ceil(total / limit),
  });
});

router.get('/history', requireRole(...TREATMENT_READ), async (req, res) => {
  if (!mongoose.isValidObjectId(req.query.patient)) {
    return res.status(400).json({ message: 'Choose a patient' });
  }
  const patient = await Patient.findById(req.query.patient).select('name patientCode');
  if (!patient) return res.status(404).json({ message: 'Patient not found' });

  const patientId = patient._id;
  const [records, grouped] = await Promise.all([
    TreatmentPlan.find({ patient: patientId }).sort({ startDate: -1, createdAt: -1 }).limit(HISTORY_LIMIT),
    TreatmentPlan.aggregate([
      { $match: { patient: patientId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);
  const counts = statusCounts(grouped);
  const total = TREATMENT_STATUSES.reduce((sum, status) => sum + counts[status], 0);
  res.json({
    patient: {
      _id: patient._id,
      name: patient.name,
      patientCode: patient.patientCode || '',
    },
    treatmentPlans: records.map((record) => presentTreatmentPlan(record, true)),
    counts,
    total,
  });
});

router.get('/overview', requireRole(...TREATMENT_READ), async (req, res) => {
  const parsed = listFilter(req.query, { ignoreStatus: true });
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  const sort = { startDate: -1, createdAt: -1 };
  const [activeTotal, completedTotal, active, completed, grouped] = await Promise.all([
    TreatmentPlan.countDocuments({ ...parsed.filter, status: 'ACTIVE' }),
    TreatmentPlan.countDocuments({ ...parsed.filter, status: 'COMPLETED' }),
    TreatmentPlan.find({ ...parsed.filter, status: 'ACTIVE' }).sort(sort).limit(BOARD_LIMIT),
    TreatmentPlan.find({ ...parsed.filter, status: 'COMPLETED' }).sort(sort).limit(BOARD_LIMIT),
    TreatmentPlan.aggregate([
      { $match: parsed.filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);
  res.json({
    active: {
      treatmentPlans: active.map((record) => presentTreatmentPlan(record)),
      total: activeTotal,
    },
    completed: {
      treatmentPlans: completed.map((record) => presentTreatmentPlan(record)),
      total: completedTotal,
    },
    counts: statusCounts(grouped),
  });
});

router.post('/', requireRole(...TREATMENT_WRITE), async (req, res) => {
  const linked = await linkedRecords(req.body, req.user);
  if (linked.error) return res.status(400).json({ message: linked.error });
  if (linked.patient.active === false) {
    return res.status(400).json({ message: 'This patient record is inactive' });
  }
  const consultation = await linkedConsultation(req.body, linked.patient._id);
  if (consultation.error) return res.status(400).json({ message: consultation.error });
  const plan = readPlan(req.body);
  if (plan.error) return res.status(400).json({ message: plan.error });
  const links = readPrescriptions(req.body, linked.patient);
  if (links.error) return res.status(400).json({ message: links.error });

  const record = new TreatmentPlan({
    ...plan.fields,
    patient: linked.patient._id,
    doctor: linked.doctor._id,
    consultation: consultation.consultationId,
    patientName: linked.patient.name,
    patientCode: linked.patient.patientCode || '',
    doctorName: linked.doctor.name,
    prescriptions: links.prescriptions || [],
  });
  remember(record, req.user, 'created', ['patient', 'doctor', 'description', 'startDate', 'status']);
  addProgress(record, req.user, { kind: 'status', note: 'Plan created', status: record.status });
  await record.save();
  res.status(201).json(presentTreatmentPlan(record, true));
});

router.get('/:id', requireRole(...TREATMENT_READ), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'Treatment plan not found' });
  }
  const record = await TreatmentPlan.findById(req.params.id);
  if (!record) return res.status(404).json({ message: 'Treatment plan not found' });
  res.json(presentTreatmentPlan(record, true));
});

router.put('/:id', requireRole(...TREATMENT_WRITE), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'Treatment plan not found' });
  }
  const record = await TreatmentPlan.findById(req.params.id);
  if (!record) return res.status(404).json({ message: 'Treatment plan not found' });
  if (!canRevise(req.user, record)) {
    return res.status(403).json({ message: 'You do not have access to that' });
  }

  const linked = await linkedRecords(req.body, req.user, record);
  if (linked.error) return res.status(400).json({ message: linked.error });
  const consultation = await linkedConsultation(req.body, linked.patient._id, record);
  if (consultation.error) return res.status(400).json({ message: consultation.error });
  const plan = readPlan(req.body, record);
  if (plan.error) return res.status(400).json({ message: plan.error });
  const links = readPrescriptions(req.body, linked.patient, record);
  if (links.error) return res.status(400).json({ message: links.error });

  const before = presentTreatmentPlan(record, true);
  const previousStatus = record.status;
  const previousFollow = record.followUpDate ? new Date(record.followUpDate).getTime() : null;
  record.set({
    ...plan.fields,
    patient: linked.patient._id,
    doctor: linked.doctor._id,
    consultation: consultation.consultationId,
    patientName: linked.patient.name,
    patientCode: linked.patient.patientCode || '',
    doctorName: linked.doctor.name,
    ...(links.prescriptions ? { prescriptions: links.prescriptions } : {}),
  });
  const fields = changedFields(before, {
    ...before,
    ...plan.fields,
    patient: linked.patient._id,
    doctor: linked.doctor._id,
    consultation: consultation.consultationId,
    prescriptions: links.prescriptions || record.prescriptions,
  });
  if (record.status !== previousStatus) {
    addProgress(record, req.user, { kind: 'status', note: '', status: record.status });
  }
  const nextFollow = record.followUpDate ? new Date(record.followUpDate).getTime() : null;
  if (nextFollow !== previousFollow) {
    addProgress(record, req.user, {
      kind: 'follow-up',
      note: '',
      status: record.status,
      followUpDate: record.followUpDate,
    });
  }
  if (fields.length) remember(record, req.user, 'updated', fields);
  await record.save();
  res.json(presentTreatmentPlan(record, true));
});

router.post('/:id/progress', requireRole(...TREATMENT_WRITE), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'Treatment plan not found' });
  }
  const record = await TreatmentPlan.findById(req.params.id);
  if (!record) return res.status(404).json({ message: 'Treatment plan not found' });
  if (!canRevise(req.user, record)) {
    return res.status(403).json({ message: 'You do not have access to that' });
  }

  const note = cleanText(req.body.note, 500);
  const requested = has(req.body, 'status') ? cleanText(req.body.status, 20) : '';
  if (requested && !TREATMENT_STATUSES.includes(requested)) {
    return res.status(400).json({ message: 'Status is not one of the listed values' });
  }
  const statusChanged = Boolean(requested && requested !== record.status);
  if (!note && !statusChanged) {
    return res.status(400).json({ message: 'Write a progress note or choose a new status' });
  }
  if (statusChanged) record.status = requested;
  addProgress(record, req.user, {
    kind: note ? 'progress' : 'status',
    note,
    status: record.status,
  });
  if (statusChanged) remember(record, req.user, 'updated', ['status']);
  await record.save();
  res.json(presentTreatmentPlan(record, true));
});

router.post('/:id/follow-up', requireRole(...TREATMENT_WRITE), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'Treatment plan not found' });
  }
  const record = await TreatmentPlan.findById(req.params.id);
  if (!record) return res.status(404).json({ message: 'Treatment plan not found' });
  if (!canRevise(req.user, record)) {
    return res.status(403).json({ message: 'You do not have access to that' });
  }

  const follow = parsePlanDate(req.body.followUpDate, 'Follow-up date', true);
  if (follow.error) return res.status(400).json({ message: follow.error });
  if (record.startDate && follow.date < record.startDate) {
    return res.status(400).json({ message: 'Follow-up date cannot be before the start date' });
  }
  const note = cleanText(req.body.note, 500);
  const same = sameDate(record.followUpDate, follow.date);
  if (same && !note) {
    return res.status(400).json({ message: 'Choose a new follow-up date or add a note' });
  }
  record.followUpDate = follow.date;
  addProgress(record, req.user, {
    kind: 'follow-up',
    note,
    status: record.status,
    followUpDate: follow.date,
  });
  if (!same) remember(record, req.user, 'updated', ['followUpDate']);
  await record.save();
  res.json(presentTreatmentPlan(record, true));
});

export default router;
