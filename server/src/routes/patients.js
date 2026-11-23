import { Router } from 'express';
import mongoose from 'mongoose';
import Patient from '../models/Patient.js';
import Medicine from '../models/Medicine.js';
import { allocatePatientCode } from '../assignPatientCodes.js';
import { presentPatient } from '../patientsView.js';
import { PATIENT_CLINICAL, PATIENT_READ, PATIENT_WRITE, canonicalRole } from '../access.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { recordAudit } from '../audit.js';
import {
  BLOOD_GROUPS,
  GENDERS,
  cleanText,
  escapeRegex,
  parseAge,
  parseAllergies,
  parseChoice,
  parseDateOfBirth,
  parseEmail,
  parseEmergencyContact,
  parseList,
  parsePhone,
  parseQuantity,
} from '../validate.js';

const router = Router();

router.use(requireAuth);
router.use((req, res, next) => {
  const roles = req.method === 'GET' || req.method === 'HEAD' ? PATIENT_READ : PATIENT_WRITE;
  return requireRole(...roles)(req, res, next);
});

function missingPatient(res) {
  return res.status(404).json({ message: 'Patient not found' });
}

function seesClinical(user) {
  return PATIENT_CLINICAL.includes(canonicalRole(user?.role));
}

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

function readIdentity(body, creating) {
  const fields = {};
  const name = cleanText(body.name, 120);
  const address = cleanText(body.address, 300);
  if (!name) return { error: 'Name is required' };
  if (!address) return { error: 'Address is required' };
  fields.name = name;
  fields.address = address;

  const born = parseDateOfBirth(body.dateOfBirth);
  if (born.error) return born;
  if (born.dateOfBirth) {
    fields.dateOfBirth = born.dateOfBirth;
    fields.age = born.age;
  } else if (creating || Object.prototype.hasOwnProperty.call(body, 'age')) {
    const age = parseAge(body.age);
    if (age == null) return { error: 'Age must be a whole number from 0 to 120' };
    fields.age = age;
  }

  if (creating || Object.prototype.hasOwnProperty.call(body, 'phone')) {
    const phone = parsePhone(body.phone);
    if (phone.error) return phone;
    fields.phone = phone.phone;
  }
  if (creating || Object.prototype.hasOwnProperty.call(body, 'email')) {
    const raw = String(body.email ?? '').trim();
    if (!raw) fields.email = '';
    else {
      const email = parseEmail(body.email);
      if (!email) return { error: 'A valid email is required' };
      fields.email = email;
    }
  }
  if (creating || Object.prototype.hasOwnProperty.call(body, 'gender')) {
    const gender = parseChoice(body.gender, GENDERS, 'Gender');
    if (gender.error) return gender;
    fields.gender = gender.value;
  }
  if (creating || Object.prototype.hasOwnProperty.call(body, 'bloodGroup')) {
    const bloodGroup = parseChoice(body.bloodGroup, BLOOD_GROUPS, 'Blood group');
    if (bloodGroup.error) return bloodGroup;
    fields.bloodGroup = bloodGroup.value;
  }
  if (creating || Object.prototype.hasOwnProperty.call(body, 'emergencyContact')) {
    const emergency = parseEmergencyContact(body.emergencyContact);
    if (emergency.error) return emergency;
    fields.emergencyContact = emergency.contact;
  }
  if (creating || Object.prototype.hasOwnProperty.call(body, 'allergies')) {
    fields.allergies = parseAllergies(body.allergies);
  }
  if (creating || Object.prototype.hasOwnProperty.call(body, 'conditions')) {
    fields.conditions = parseList(body.conditions);
  }
  return { fields };
}

async function loadPatient(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return Patient.findById(id);
}

router.get('/', async (req, res) => {
  const page = pageNumber(req.query.page);
  const limit = pageLimit(req.query.limit);
  const q = cleanText(req.query.q, 80);
  const gender = cleanText(req.query.gender, 20);
  const active = cleanText(req.query.active, 5);
  const clinical = seesClinical(req.user);
  const filter = {};

  if (q) {
    const regex = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: regex }, { patientCode: regex }, { phone: regex }];
  }
  if (GENDERS.includes(gender)) filter.gender = gender;
  if (active === 'true') filter.active = { $ne: false };
  if (active === 'false') filter.active = false;
  if (clinical && Object.prototype.hasOwnProperty.call(req.query, 'bloodGroup')) {
    const bloodGroup = cleanText(req.query.bloodGroup, 8);
    if (BLOOD_GROUPS.includes(bloodGroup)) filter.bloodGroup = bloodGroup;
  }

  const [total, patients] = await Promise.all([
    Patient.countDocuments(filter),
    Patient.find(filter)
      .select('-visits')
      .collation({ locale: 'en', strength: 2 })
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);

  res.json({
    patients: patients.map((patient) => presentPatient(patient, clinical)),
    page,
    limit,
    total,
    pages: total === 0 ? 0 : Math.ceil(total / limit),
  });
});

router.post('/', async (req, res) => {
  const parsed = readIdentity(req.body, true);
  if (parsed.error) return res.status(400).json({ message: parsed.error });

  let patient;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      patient = await Patient.create({
        ...parsed.fields,
        patientCode: await allocatePatientCode(),
        allergies: parsed.fields.allergies || [],
        conditions: parsed.fields.conditions || [],
        registeredAt: new Date(),
        active: true,
        visitCount: 0,
        visits: [],
      });
      break;
    } catch (error) {
      if (error.code !== 11000 || attempt === 2) throw error;
    }
  }
  res.status(201).json(presentPatient(patient, true));
  await recordAudit(req, { action: 'patient-registered', entityType: 'patient', entityId: patient._id, summary: `Patient ${patient.patientCode} registered` });
});

router.get('/:id/consultations', async (req, res) => {
  if (!seesClinical(req.user)) {
    return res.status(403).json({ message: 'You do not have access to that medical record' });
  }
  const patient = await loadPatient(req.params.id);
  if (!patient) return missingPatient(res);
  res.json({ consultations: presentPatient(patient, true).consultations });
});

router.get('/:id/treatments', async (req, res) => {
  if (!seesClinical(req.user)) {
    return res.status(403).json({ message: 'You do not have access to that medical record' });
  }
  const patient = await loadPatient(req.params.id);
  if (!patient) return missingPatient(res);
  res.json({ treatments: presentPatient(patient, true).treatments });
});

router.get('/:id/prescriptions', async (req, res) => {
  if (!seesClinical(req.user)) {
    return res.status(403).json({ message: 'You do not have access to that medical record' });
  }
  const patient = await loadPatient(req.params.id);
  if (!patient) return missingPatient(res);
  res.json({ prescriptions: presentPatient(patient, true).prescriptions });
});

router.get('/:id', async (req, res) => {
  const patient = await loadPatient(req.params.id);
  if (!patient) return missingPatient(res);
  res.json(presentPatient(patient, seesClinical(req.user)));
});

router.put('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return missingPatient(res);
  const parsed = readIdentity(req.body, false);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  const patient = await Patient.findByIdAndUpdate(
    req.params.id,
    { $set: parsed.fields },
    { new: true, runValidators: true }
  );
  if (!patient) return missingPatient(res);
  res.json(presentPatient(patient, true));
});

router.patch('/:id/active', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return missingPatient(res);
  if (typeof req.body.active !== 'boolean') {
    return res.status(400).json({ message: 'Say whether the patient record is active' });
  }
  const patient = await Patient.findByIdAndUpdate(
    req.params.id,
    { active: req.body.active },
    { new: true, runValidators: true }
  );
  if (!patient) return missingPatient(res);
  res.json(presentPatient(patient, true));
});

router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return missingPatient(res);
  const patient = await Patient.findByIdAndDelete(req.params.id);
  if (!patient) return missingPatient(res);
  res.json({ ok: true });
});

router.post('/:id/visit', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return missingPatient(res);
  const patient = await Patient.findOneAndUpdate(
    { _id: req.params.id, active: { $ne: false } },
    {
      $inc: { visitCount: 1 },
      $push: { visits: { visitedAt: new Date(), treatments: [] } },
    },
    { new: true }
  );
  if (!patient) {
    const exists = await Patient.exists({ _id: req.params.id });
    if (!exists) return missingPatient(res);
    return res.status(400).json({ message: 'This patient record is inactive' });
  }
  res.json(patient);
});

router.post('/:id/visit/undo', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return missingPatient(res);
  const patient = await Patient.findById(req.params.id);
  if (!patient) return missingPatient(res);
  const last = patient.visits[patient.visits.length - 1];
  if (!last) return res.status(400).json({ message: 'There is no visit to undo' });
  if (last.treatments.length > 0) {
    return res.status(400).json({ message: 'This visit already has a treatment, so it stays on the chart' });
  }
  patient.visits.pop();
  patient.visitCount = patient.visits.length;
  await patient.save();
  res.json(patient);
});

router.post('/:id/treatments', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return missingPatient(res);
  if (!mongoose.isValidObjectId(req.body.medicineId)) {
    return res.status(400).json({ message: 'Choose a medicine from the catalog' });
  }
  const medicine = await Medicine.findById(req.body.medicineId);
  if (!medicine) return res.status(400).json({ message: 'That medicine is no longer in the catalog' });

  const patient = await Patient.findById(req.params.id);
  if (!patient) return missingPatient(res);
  if (patient.active === false) {
    return res.status(400).json({ message: 'This patient record is inactive' });
  }
  if (patient.visits.length === 0) {
    patient.visits.push({ visitedAt: new Date(), treatments: [] });
    patient.visitCount = patient.visits.length;
  }

  const visit = patient.visits[patient.visits.length - 1];
  const prescribed = req.body.quantity == null || req.body.quantity === ''
    ? null
    : parseQuantity(req.body.quantity, 'Prescribed quantity');
  if (prescribed?.error) return res.status(400).json({ message: prescribed.error });

  visit.treatments.push({
    medicine: medicine._id,
    medicineName: medicine.name,
    strength: medicine.strength,
    form: medicine.form,
    notes: cleanText(req.body.notes, 400),
    ...(prescribed ? { quantity: prescribed.quantity } : {}),
    recordedAt: new Date(),
  });
  await patient.save();
  await recordAudit(req, { action: 'prescription', entityType: 'patient', entityId: patient._id, summary: `Prescription recorded for ${patient.patientCode || 'a patient'}` });
  res.json(patient);
});

router.delete('/:id/treatments/:treatmentId', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.treatmentId)) {
    return res.status(404).json({ message: 'Treatment not found' });
  }
  const patient = await Patient.findById(req.params.id);
  if (!patient) return missingPatient(res);
  let removed = false;
  for (const visit of patient.visits) {
    const next = visit.treatments.filter((item) => String(item._id) !== req.params.treatmentId);
    if (next.length !== visit.treatments.length) {
      visit.treatments = next;
      removed = true;
    }
  }
  if (!removed) return res.status(404).json({ message: 'Treatment not found' });
  await patient.save();
  res.json(patient);
});

export default router;
