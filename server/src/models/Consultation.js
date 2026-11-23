import mongoose from 'mongoose';

const vitalSchema = new mongoose.Schema(
  {
    systolic: { type: Number, min: 40, max: 300 },
    diastolic: { type: Number, min: 20, max: 200 },
    pulse: { type: Number, min: 0, max: 300 },
    temperature: { type: Number, min: 30, max: 45 },
    respiratoryRate: { type: Number, min: 0, max: 80 },
    oxygenSaturation: { type: Number, min: 0, max: 100 },
    weightKg: { type: Number, min: 0, max: 500 },
    heightCm: { type: Number, min: 0, max: 300 },
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

const consultationSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    patientName: { type: String, required: true, trim: true },
    patientCode: { type: String, default: '', trim: true },
    doctorName: { type: String, required: true, trim: true },
    consultedAt: { type: Date, required: true },
    chiefComplaint: { type: String, required: true, trim: true, maxlength: 300 },
    symptoms: { type: String, default: '', maxlength: 2000 },
    medicalHistory: { type: String, default: '', maxlength: 2000 },
    examination: { type: String, default: '', maxlength: 2000 },
    vitals: { type: vitalSchema, default: () => ({}) },
    diagnosis: { type: String, default: '', maxlength: 500 },
    investigations: { type: [String], default: [] },
    notes: { type: String, default: '', maxlength: 2000 },
    followUp: { type: String, default: '', maxlength: 500 },
    audit: { type: [auditSchema], default: [] },
  },
  { timestamps: true }
);

consultationSchema.index({ patient: 1, consultedAt: -1 });
consultationSchema.index({ doctor: 1, consultedAt: -1 });
consultationSchema.index({ consultedAt: -1 });

export function presentConsultation(record) {
  const vitals = record.vitals || {};
  return {
    _id: record._id,
    patient: record.patient,
    doctor: record.doctor,
    patientName: record.patientName,
    patientCode: record.patientCode || '',
    doctorName: record.doctorName,
    consultedAt: record.consultedAt,
    chiefComplaint: record.chiefComplaint,
    symptoms: record.symptoms || '',
    medicalHistory: record.medicalHistory || '',
    examination: record.examination || '',
    vitals: {
      systolic: vitals.systolic ?? null,
      diastolic: vitals.diastolic ?? null,
      pulse: vitals.pulse ?? null,
      temperature: vitals.temperature ?? null,
      respiratoryRate: vitals.respiratoryRate ?? null,
      oxygenSaturation: vitals.oxygenSaturation ?? null,
      weightKg: vitals.weightKg ?? null,
      heightCm: vitals.heightCm ?? null,
    },
    diagnosis: record.diagnosis || '',
    investigations: Array.isArray(record.investigations) ? [...record.investigations] : [],
    notes: record.notes || '',
    followUp: record.followUp || '',
    audit: (record.audit || []).map((entry) => ({
      at: entry.at,
      userId: entry.userId,
      name: entry.name,
      action: entry.action,
      fields: [...(entry.fields || [])],
    })),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export default mongoose.models.Consultation || mongoose.model('Consultation', consultationSchema);
