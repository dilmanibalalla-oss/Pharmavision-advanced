import { Router } from 'express';
import mongoose from 'mongoose';
import Consultation, { presentConsultation } from '../models/Consultation.js';
import Patient from '../models/Patient.js';
import User from '../models/User.js';
import {
  CONSULTATION_READ,
  CONSULTATION_WRITE,
  DOCTOR_STORED_ROLES,
  canonicalRole,
} from '../access.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  cleanText,
  escapeRegex,
  parseConsultedAt,
  parseList,
  parseVitals,
} from '../validate.js';

const router = Router();
const TEXT_FIELDS = [
  ['symptoms', 2000],
  ['medicalHistory', 2000],
  ['examination', 2000],
  ['diagnosis', 500],
  ['notes', 2000],
  ['followUp', 500],
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

function canRevise(user, consultation) {
  if (canonicalRole(user.role) === 'ADMIN') return true;
  return String(consultation.doctor) === String(user._id);
}

async function linkedRecords(body, user, current) {
  let patientId = body.patient || current?.patient;
  if (current && canonicalRole(user.role) !== 'ADMIN') patientId = current.patient;
  if (!mongoose.isValidObjectId(patientId)) return { error: 'Choose a patient' };
  const patient = await Patient.findById(patientId).select('name patientCode active');
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

function has(body, key) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function readClinical(body, updating) {
  const fields = {};
  if (!updating || has(body, 'chiefComplaint')) {
    const chiefComplaint = cleanText(body.chiefComplaint, 300);
    if (!chiefComplaint) return { error: 'Chief complaint is required' };
    fields.chiefComplaint = chiefComplaint;
  }
  for (const [key, max] of TEXT_FIELDS) {
    if (!updating || has(body, key)) fields[key] = cleanText(body[key], max);
  }
  if (!updating || has(body, 'vitals')) {
    const vitals = parseVitals(body.vitals);
    if (vitals.error) return vitals;
    fields.vitals = vitals.vitals;
  }
  if (!updating || has(body, 'investigations')) fields.investigations = parseList(body.investigations, 20, 160);
  if (!updating || has(body, 'consultedAt')) {
    const when = parseConsultedAt(body.consultedAt);
    if (when.error) return when;
    fields.consultedAt = when.consultedAt;
  }
  return { fields };
}

function sameVitals(left, right) {
  const keys = ['systolic', 'diastolic', 'pulse', 'temperature', 'respiratoryRate', 'oxygenSaturation', 'weightKg', 'heightCm'];
  return keys.every((key) => (left?.[key] ?? null) === (right?.[key] ?? null));
}

function changedFields(before, after) {
  const fields = [];
  if (String(before.patient) !== String(after.patient)) fields.push('patient');
  if (String(before.doctor) !== String(after.doctor)) fields.push('doctor');
  if (new Date(before.consultedAt).toISOString() !== new Date(after.consultedAt).toISOString()) fields.push('consultedAt');
  if (before.chiefComplaint !== after.chiefComplaint) fields.push('chiefComplaint');
  for (const [key] of TEXT_FIELDS) {
    if ((before[key] || '') !== (after[key] || '')) fields.push(key);
  }
  if (JSON.stringify(before.investigations || []) !== JSON.stringify(after.investigations || [])) fields.push('investigations');
  if (!sameVitals(before.vitals, after.vitals)) fields.push('vitals');
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

router.get('/', requireRole(...CONSULTATION_READ), async (req, res) => {
  const page = pageNumber(req.query.page);
  const limit = pageLimit(req.query.limit);
  const q = cleanText(req.query.q, 80);
  const filter = {};
  if (mongoose.isValidObjectId(req.query.patient)) filter.patient = req.query.patient;
  if (mongoose.isValidObjectId(req.query.doctor)) filter.doctor = req.query.doctor;
  const from = req.query.from ? new Date(req.query.from) : null;
  const to = req.query.to ? new Date(req.query.to) : null;
  if (from && !Number.isNaN(from.getTime())) filter.consultedAt = { ...filter.consultedAt, $gte: from };
  if (to && !Number.isNaN(to.getTime())) {
    const end = new Date(to);
    if (String(req.query.to).length <= 10) end.setHours(23, 59, 59, 999);
    filter.consultedAt = { ...filter.consultedAt, $lte: end };
  }
  if (q) {
    const regex = new RegExp(escapeRegex(q), 'i');
    filter.$or = [
      { patientName: regex },
      { patientCode: regex },
      { doctorName: regex },
      { chiefComplaint: regex },
      { diagnosis: regex },
    ];
  }

  const [total, records] = await Promise.all([
    Consultation.countDocuments(filter),
    Consultation.find(filter).sort({ consultedAt: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit),
  ]);
  res.json({
    consultations: records.map(presentConsultation),
    page,
    limit,
    total,
    pages: total === 0 ? 0 : Math.ceil(total / limit),
  });
});

router.post('/', requireRole(...CONSULTATION_WRITE), async (req, res) => {
  const linked = await linkedRecords(req.body, req.user);
  if (linked.error) return res.status(400).json({ message: linked.error });
  if (linked.patient.active === false) {
    return res.status(400).json({ message: 'This patient record is inactive' });
  }
  const clinical = readClinical(req.body, false);
  if (clinical.error) return res.status(400).json({ message: clinical.error });

  const record = new Consultation({
    ...clinical.fields,
    patient: linked.patient._id,
    doctor: linked.doctor._id,
    patientName: linked.patient.name,
    patientCode: linked.patient.patientCode || '',
    doctorName: linked.doctor.name,
  });
  remember(record, req.user, 'created', ['patient', 'doctor', 'consultedAt', 'chiefComplaint']);
  await record.save();
  res.status(201).json(presentConsultation(record));
});

router.get('/:id', requireRole(...CONSULTATION_READ), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'Consultation not found' });
  }
  const record = await Consultation.findById(req.params.id);
  if (!record) return res.status(404).json({ message: 'Consultation not found' });
  res.json(presentConsultation(record));
});

router.put('/:id', requireRole(...CONSULTATION_WRITE), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'Consultation not found' });
  }
  const record = await Consultation.findById(req.params.id);
  if (!record) return res.status(404).json({ message: 'Consultation not found' });
  if (!canRevise(req.user, record)) {
    return res.status(403).json({ message: 'You do not have access to that' });
  }

  const linked = await linkedRecords(req.body, req.user, record);
  if (linked.error) return res.status(400).json({ message: linked.error });
  const clinical = readClinical(req.body, true);
  if (clinical.error) return res.status(400).json({ message: clinical.error });

  const before = presentConsultation(record);
  record.set({
    ...clinical.fields,
    patient: linked.patient._id,
    doctor: linked.doctor._id,
    patientName: linked.patient.name,
    patientCode: linked.patient.patientCode || '',
    doctorName: linked.doctor.name,
  });
  const fields = changedFields(before, {
    ...before,
    ...clinical.fields,
    patient: linked.patient._id,
    doctor: linked.doctor._id,
  });
  if (fields.length) remember(record, req.user, 'updated', fields);
  await record.save();
  res.json(presentConsultation(record));
});

export default router;
