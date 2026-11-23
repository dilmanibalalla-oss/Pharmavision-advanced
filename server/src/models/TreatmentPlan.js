import mongoose from 'mongoose';
import { TREATMENT_STATUSES } from '../validate.js';

const progressSchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    kind: { type: String, enum: ['progress', 'status', 'follow-up'], required: true },
    note: { type: String, default: '', maxlength: 500 },
    status: { type: String, enum: [...TREATMENT_STATUSES, ''], default: '' },
    followUpDate: { type: Date, default: null },
  },
  { _id: false }
);

const prescriptionLinkSchema = new mongoose.Schema(
  {
    prescription: { type: mongoose.Schema.Types.ObjectId, required: true },
    medicineName: { type: String, required: true },
    strength: { type: String, default: '' },
    form: { type: String, default: '' },
    recordedAt: { type: Date },
  },
  { _id: false }
);

const auditSchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    action: { type: String, enum: ['created', 'updated'], required: true },
    fields: { type: [String], default: [] },
  },
  { _id: false }
);

const treatmentPlanSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    consultation: { type: mongoose.Schema.Types.ObjectId, ref: 'Consultation', default: null },
    patientName: { type: String, required: true, trim: true },
    patientCode: { type: String, default: '', trim: true },
    doctorName: { type: String, required: true, trim: true },
    diagnosis: { type: String, default: '', maxlength: 500 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    instructions: { type: String, default: '', maxlength: 2000 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    followUpDate: { type: Date, default: null },
    status: { type: String, enum: TREATMENT_STATUSES, default: 'PLANNED', required: true },
    prescriptions: { type: [prescriptionLinkSchema], default: [] },
    progress: { type: [progressSchema], default: [] },
    audit: { type: [auditSchema], default: [] },
  },
  { timestamps: true }
);

treatmentPlanSchema.index({ patient: 1, startDate: -1 });
treatmentPlanSchema.index({ doctor: 1, startDate: -1 });
treatmentPlanSchema.index({ status: 1, startDate: -1 });
treatmentPlanSchema.index({ consultation: 1, startDate: -1 });

function presentLink(item) {
  return {
    _id: item.prescription,
    medicineName: item.medicineName,
    strength: item.strength || '',
    form: item.form || '',
    recordedAt: item.recordedAt || null,
  };
}

export function presentTreatmentPlan(record, detail = false) {
  const view = {
    _id: record._id,
    patient: record.patient,
    doctor: record.doctor,
    consultation: record.consultation || null,
    patientName: record.patientName,
    patientCode: record.patientCode || '',
    doctorName: record.doctorName,
    diagnosis: record.diagnosis || '',
    description: record.description,
    instructions: record.instructions || '',
    startDate: record.startDate,
    endDate: record.endDate || null,
    followUpDate: record.followUpDate || null,
    status: record.status,
    prescriptionCount: Array.isArray(record.prescriptions) ? record.prescriptions.length : 0,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
  if (!detail) return view;
  return {
    ...view,
    prescriptions: (record.prescriptions || []).map(presentLink),
    progress: (record.progress || []).map((entry) => ({
      at: entry.at,
      userId: entry.userId,
      name: entry.name,
      kind: entry.kind,
      note: entry.note || '',
      status: entry.status || '',
      followUpDate: entry.followUpDate || null,
    })),
    audit: (record.audit || []).map((entry) => ({
      at: entry.at,
      userId: entry.userId,
      name: entry.name,
      action: entry.action,
      fields: [...(entry.fields || [])],
    })),
  };
}

export default mongoose.models.TreatmentPlan || mongoose.model('TreatmentPlan', treatmentPlanSchema);
