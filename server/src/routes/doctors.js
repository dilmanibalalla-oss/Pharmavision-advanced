import { Router } from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User, { doctorView } from '../models/User.js';
import { DOCTOR_READ, DOCTOR_STORED_ROLES, DOCTOR_WRITE } from '../access.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  cleanText,
  escapeRegex,
  parseEmail,
  parsePhone,
  parseQualifications,
  parseRegistrationNumber,
  parseSchedule,
} from '../validate.js';

const router = Router();

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

function doctorQuery(id) {
  return { _id: id, role: { $in: DOCTOR_STORED_ROLES } };
}

function readDoctorFields(body, creating) {
  const fields = {};
  if (creating || Object.prototype.hasOwnProperty.call(body, 'name')) {
    const name = cleanText(body.name, 120);
    if (!name) return { error: 'Name is required' };
    fields.name = name;
  }
  if (creating || Object.prototype.hasOwnProperty.call(body, 'email')) {
    const email = parseEmail(body.email);
    if (!email) return { error: 'A valid email is required' };
    fields.email = email;
  }
  if (creating || Object.prototype.hasOwnProperty.call(body, 'specialization')) {
    const specialization = cleanText(body.specialization, 80);
    if (!specialization) return { error: 'Specialization is required' };
    fields.specialization = specialization;
  }
  if (creating || Object.prototype.hasOwnProperty.call(body, 'qualifications')) {
    const parsed = parseQualifications(body.qualifications);
    if (parsed.error) return parsed;
    fields.qualifications = parsed.items;
  }
  if (creating || Object.prototype.hasOwnProperty.call(body, 'registrationNumber')) {
    const parsed = parseRegistrationNumber(body.registrationNumber);
    if (parsed.error) return parsed;
    fields.registrationNumber = parsed.registrationNumber;
  }
  if (creating || Object.prototype.hasOwnProperty.call(body, 'registrationBody')) {
    fields.registrationBody = cleanText(body.registrationBody, 120);
  }
  if (creating || Object.prototype.hasOwnProperty.call(body, 'phone')) {
    const parsed = parsePhone(body.phone);
    if (parsed.error) return parsed;
    fields.phone = parsed.phone;
  }
  if (creating || Object.prototype.hasOwnProperty.call(body, 'address')) {
    fields.address = cleanText(body.address, 300);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'schedule')) {
    const parsed = parseSchedule(body.schedule);
    if (parsed.error) return parsed;
    fields.schedule = parsed.slots;
  }
  return { fields };
}

async function availabilityError(fields, exceptId) {
  const clauses = [];
  if (fields.email) clauses.push({ email: fields.email });
  if (fields.registrationNumber) clauses.push({ registrationNumber: fields.registrationNumber });
  if (clauses.length === 0) return '';

  const taken = await User.findOne({
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
    ...(clauses.length === 1 ? clauses[0] : { $or: clauses }),
  }).select('email registrationNumber');
  if (!taken) return '';
  if (fields.email && taken.email === fields.email) return 'That email is already in use';
  return 'That registration number is already in use';
}

function duplicateMessage(error) {
  const pattern = error.keyPattern || error.errorResponse?.keyPattern || {};
  if (pattern.registrationNumber) return 'That registration number is already in use';
  if (pattern.email) return 'That email is already in use';
  return '';
}

router.get('/specializations', requireRole(...DOCTOR_READ), async (_req, res) => {
  const names = await User.distinct('specialization', {
    role: { $in: DOCTOR_STORED_ROLES },
    specialization: { $nin: [null, ''] },
  });
  names.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
  res.json({ specializations: names });
});

router.patch('/specializations', requireRole(...DOCTOR_WRITE), async (req, res) => {
  const from = cleanText(req.body.from, 80);
  const to = cleanText(req.body.to, 80);
  if (!from || !to) return res.status(400).json({ message: 'Both specialization names are required' });
  if (from.toLowerCase() === to.toLowerCase()) {
    return res.status(400).json({ message: 'Choose a different specialization name' });
  }
  const result = await User.updateMany(
    {
      role: { $in: DOCTOR_STORED_ROLES },
      specialization: new RegExp(`^${escapeRegex(from)}$`, 'i'),
    },
    { $set: { specialization: to } }
  );
  if (result.matchedCount === 0) {
    return res.status(404).json({ message: 'No doctor has that specialization' });
  }
  res.json({ updated: result.modifiedCount });
});

router.get('/', requireRole(...DOCTOR_READ), async (req, res) => {
  const page = pageNumber(req.query.page);
  const limit = pageLimit(req.query.limit);
  const q = cleanText(req.query.q, 80);
  const specialization = cleanText(req.query.specialization, 80);
  const active = cleanText(req.query.active, 5);
  const filter = { role: { $in: DOCTOR_STORED_ROLES } };

  if (active === 'true') filter.active = { $ne: false };
  if (active === 'false') filter.active = false;
  if (specialization) filter.specialization = new RegExp(`^${escapeRegex(specialization)}$`, 'i');
  if (q) {
    const regex = new RegExp(escapeRegex(q), 'i');
    filter.$or = [
      { name: regex },
      { email: regex },
      { phone: regex },
      { address: regex },
      { specialization: regex },
      { qualifications: regex },
      { registrationNumber: regex },
      { registrationBody: regex },
    ];
  }

  const [total, doctors] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .collation({ locale: 'en', strength: 2 })
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);

  res.json({
    doctors: doctors.map(doctorView),
    page,
    limit,
    total,
    pages: total === 0 ? 0 : Math.ceil(total / limit),
  });
});

router.post('/', requireRole(...DOCTOR_WRITE), async (req, res) => {
  const password = String(req.body.password ?? '');
  if (password.length < 8 || password.length > 200) {
    return res.status(400).json({ message: 'Use a password of at least 8 characters' });
  }
  const parsed = readDoctorFields(req.body, true);
  if (parsed.error) return res.status(400).json({ message: parsed.error });

  const conflict = await availabilityError(parsed.fields);
  if (conflict) return res.status(409).json({ message: conflict });

  try {
    const doctor = await User.create({
      ...parsed.fields,
      schedule: parsed.fields.schedule || [],
      passwordHash: await bcrypt.hash(password, 10),
      role: 'DOCTOR',
      active: true,
    });
    res.status(201).json({ doctor: doctorView(doctor) });
  } catch (error) {
    const message = error.code === 11000 ? duplicateMessage(error) : '';
    if (message) return res.status(409).json({ message });
    throw error;
  }
});

router.get('/:id', requireRole(...DOCTOR_READ), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'Doctor not found' });
  }
  const doctor = await User.findOne(doctorQuery(req.params.id));
  if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
  res.json({ doctor: doctorView(doctor) });
});

router.put('/:id', requireRole(...DOCTOR_WRITE), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'Doctor not found' });
  }
  const doctor = await User.findOne(doctorQuery(req.params.id));
  if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

  const parsed = readDoctorFields(req.body, false);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  const conflict = await availabilityError(parsed.fields, doctor._id);
  if (conflict) return res.status(409).json({ message: conflict });

  Object.assign(doctor, parsed.fields);
  doctor.role = 'DOCTOR';
  try {
    await doctor.save();
  } catch (error) {
    const message = error.code === 11000 ? duplicateMessage(error) : '';
    if (message) return res.status(409).json({ message });
    throw error;
  }
  res.json({ doctor: doctorView(doctor) });
});

router.put('/:id/schedule', requireRole(...DOCTOR_WRITE), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'Doctor not found' });
  }
  if (!Object.prototype.hasOwnProperty.call(req.body, 'schedule')) {
    return res.status(400).json({ message: 'Schedule must be a list of sessions' });
  }
  const parsed = parseSchedule(req.body.schedule);
  if (parsed.error) return res.status(400).json({ message: parsed.error });

  const doctor = await User.findOneAndUpdate(
    doctorQuery(req.params.id),
    { $set: { schedule: parsed.slots, role: 'DOCTOR' } },
    { new: true }
  );
  if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
  res.json({ doctor: doctorView(doctor) });
});

router.patch('/:id/active', requireRole(...DOCTOR_WRITE), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'Doctor not found' });
  }
  if (typeof req.body.active !== 'boolean') {
    return res.status(400).json({ message: 'Say whether the account is active' });
  }

  const doctor = await User.findOne(doctorQuery(req.params.id));
  if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

  doctor.active = req.body.active;
  doctor.role = 'DOCTOR';
  await doctor.save();
  if (!doctor.active) {
    await User.updateOne(
      { _id: doctor._id },
      { $unset: { refreshTokenHash: 1, refreshTokenExpiresAt: 1 } }
    );
  }
  res.json({ doctor: doctorView(doctor) });
});

export default router;
