import mongoose from 'mongoose';

const allocationSchema = new mongoose.Schema(
  {
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true },
    batchNumber: { type: String, required: true },
    expiryDate: { type: Date, required: true },
    quantity: { type: Number, required: true, min: 1 },
    storageLocation: { type: String, default: '' },
    movement: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { _id: false }
);

const dispensingSchema = new mongoose.Schema(
  {
    dispensingCode: { type: String, trim: true },
    requestId: { type: String, required: true, unique: true, trim: true },
    status: { type: String, enum: ['pending', 'posted'], default: 'pending' },
    fillStatus: { type: String, enum: ['PARTIAL', 'COMPLETED'], default: 'PARTIAL' },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    patientName: { type: String, required: true },
    patientCode: { type: String, default: '' },
    prescription: { type: mongoose.Schema.Types.ObjectId, required: true },
    pharmacist: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    pharmacistName: { type: String, required: true },
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
    medicineName: { type: String, required: true },
    strength: { type: String, default: '' },
    form: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    prescribedQuantity: { type: Number, required: true, min: 1 },
    dispensedQuantity: { type: Number, required: true, min: 0 },
    allocations: { type: [allocationSchema], default: [] },
  },
  { timestamps: true }
);

dispensingSchema.index({ prescription: 1, createdAt: -1 });
dispensingSchema.index({ patient: 1, createdAt: -1 });

const fillSchema = new mongoose.Schema(
  {
    prescription: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
    prescribedQuantity: { type: Number, required: true, min: 1 },
    dispensedQuantity: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

export function presentDispensing(record) {
  const remaining = Math.max(0, record.prescribedQuantity - record.dispensedQuantity);
  return {
    _id: record._id,
    dispensingCode: record.dispensingCode || '',
    requestId: record.requestId,
    status: record.fillStatus,
    patient: record.patient,
    patientName: record.patientName,
    patientCode: record.patientCode || '',
    prescription: record.prescription,
    pharmacist: record.pharmacist,
    pharmacistName: record.pharmacistName,
    medicine: record.medicine,
    medicineName: record.medicineName,
    strength: record.strength || '',
    form: record.form || '',
    quantity: record.quantity,
    prescribedQuantity: record.prescribedQuantity,
    dispensedQuantity: record.dispensedQuantity,
    remainingQuantity: remaining,
    allocations: (record.allocations || []).map((item) => ({
      batch: item.batch,
      batchNumber: item.batchNumber,
      expiryDate: item.expiryDate,
      quantity: item.quantity,
      storageLocation: item.storageLocation || '',
    })),
    createdAt: record.createdAt,
  };
}

export const PrescriptionFill = mongoose.models.PrescriptionFill || mongoose.model('PrescriptionFill', fillSchema);
export default mongoose.models.Dispensing || mongoose.model('Dispensing', dispensingSchema);
