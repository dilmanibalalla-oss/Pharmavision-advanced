import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema(
  {
    supplierCode: { type: String, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    contactPerson: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    address: { type: String, required: true, trim: true, maxlength: 300 },
    registration: { type: String, default: '', maxlength: 200 },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', required: true },
    notes: { type: String, default: '', maxlength: 2000 },
  },
  { timestamps: true }
);

supplierSchema.index({ supplierCode: 1 }, { unique: true, sparse: true });
supplierSchema.index({ name: 1 });
supplierSchema.index({ status: 1, name: 1 });

export function presentSupplier(record) {
  return {
    _id: record._id,
    supplierCode: record.supplierCode || '',
    name: record.name,
    contactPerson: record.contactPerson,
    phone: record.phone || '',
    email: record.email || '',
    address: record.address,
    registration: record.registration || '',
    status: record.status,
    notes: record.notes || '',
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export default mongoose.models.Supplier || mongoose.model('Supplier', supplierSchema);
