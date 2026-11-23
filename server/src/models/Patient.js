import mongoose from 'mongoose';

const treatmentSchema = new mongoose.Schema(
  {
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
    medicineName: { type: String, required: true },
    strength: { type: String, default: '' },
    form: { type: String, default: '' },
    notes: { type: String, default: '' },
    quantity: { type: Number, min: 1 },
    recordedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const visitSchema = new mongoose.Schema(
  {
    visitedAt: { type: Date, default: Date.now },
    treatments: { type: [treatmentSchema], default: [] },
  },
  { _id: true }
);

const patientSchema = new mongoose.Schema(
  {
    patientCode: { type: String, trim: true, unique: true, sparse: true },
    name: { type: String, required: true, trim: true },
    dateOfBirth: { type: Date },
    age: { type: Number, required: true, min: 0, max: 120 },
    gender: { type: String, enum: ['Female', 'Male', 'Other', ''], default: '' },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    address: { type: String, required: true, trim: true },
    emergencyContact: {
      name: { type: String, trim: true, default: '' },
      phone: { type: String, trim: true, default: '' },
      relationship: { type: String, trim: true, default: '' },
    },
    bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', ''], default: '' },
    allergies: { type: [String], default: [] },
    conditions: { type: [String], default: [] },
    registeredAt: { type: Date },
    active: { type: Boolean, default: true },
    visitCount: { type: Number, default: 0, min: 0 },
    visits: { type: [visitSchema], default: [] },
  },
  { timestamps: true }
);

patientSchema.index({ name: 1 });
patientSchema.index({ phone: 1 });
patientSchema.index({ active: 1, name: 1 });
patientSchema.index({ gender: 1 });

export default mongoose.models.Patient || mongoose.model('Patient', patientSchema);
