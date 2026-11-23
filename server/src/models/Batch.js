import mongoose from 'mongoose';

const batchSchema = new mongoose.Schema(
  {
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
    medicineName: { type: String, required: true },
    strength: { type: String, default: '' },
    form: { type: String, default: '' },
    batchNumber: { type: String, required: true, trim: true },
    manufacturingDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },
    receivedQuantity: { type: Number, required: true, min: 0 },
    remainingQuantity: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, min: 0, default: 0 },
    purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
    supplierName: { type: String, default: '' },
    storageLocation: { type: String, required: true, trim: true },
    status: { type: String, enum: ['AVAILABLE', 'EXPIRED', 'DAMAGED', 'DEPLETED'], default: 'AVAILABLE' },
  },
  { timestamps: true }
);

batchSchema.index({ medicine: 1, batchNumber: 1, storageLocation: 1 }, { unique: true });
batchSchema.index({ expiryDate: 1, remainingQuantity: 1 });
batchSchema.index({ purchaseOrder: 1 });
batchSchema.index({ supplier: 1 });

export function presentBatch(record) {
  return {
    _id: record._id,
    medicine: record.medicine,
    medicineName: record.medicineName,
    strength: record.strength || '',
    form: record.form || '',
    batchNumber: record.batchNumber,
    manufacturingDate: record.manufacturingDate,
    expiryDate: record.expiryDate,
    receivedQuantity: record.receivedQuantity,
    remainingQuantity: record.remainingQuantity,
    unitCost: record.unitCost || 0,
    purchaseOrder: record.purchaseOrder || null,
    supplier: record.supplier || null,
    supplierName: record.supplierName || '',
    storageLocation: record.storageLocation,
    status: record.status,
    createdAt: record.createdAt,
  };
}

export default mongoose.models.Batch || mongoose.model('Batch', batchSchema);
