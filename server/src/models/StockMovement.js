import mongoose from 'mongoose';

export const MOVEMENT_TYPES = [
  'PURCHASE',
  'DISPENSING',
  'RETURN',
  'AUTHORIZED_ADJUSTMENT',
  'TRANSFER',
  'EXPIRED',
  'DAMAGED',
];

const stockMovementSchema = new mongoose.Schema(
  {
    movementCode: { type: String, trim: true },
    requestId: { type: String, trim: true },
    type: { type: String, enum: MOVEMENT_TYPES, required: true },
    direction: { type: String, enum: ['IN', 'OUT', 'MOVE'], required: true },
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
    medicineName: { type: String, required: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true },
    batchNumber: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    balanceAfter: { type: Number, min: 0 },
    reason: { type: String, default: '' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null },
    prescription: { type: mongoose.Schema.Types.ObjectId, default: null },
    dispensing: { type: mongoose.Schema.Types.ObjectId, default: null },
    fromLocation: { type: String, default: '' },
    toLocation: { type: String, default: '' },
  },
  { timestamps: true }
);

stockMovementSchema.index(
  { requestId: 1, batch: 1, type: 1 },
  { unique: true, partialFilterExpression: { requestId: { $type: 'string', $gt: '' } } }
);
stockMovementSchema.index({ medicine: 1, createdAt: -1 });
stockMovementSchema.index({ batch: 1, createdAt: -1 });
stockMovementSchema.index({ type: 1, createdAt: -1 });

export function presentMovement(record) {
  return {
    _id: record._id,
    movementCode: record.movementCode || '',
    type: record.type,
    direction: record.direction,
    medicine: record.medicine,
    medicineName: record.medicineName,
    batch: record.batch,
    batchNumber: record.batchNumber || '',
    quantity: record.quantity,
    balanceAfter: record.balanceAfter,
    reason: record.reason || '',
    userId: record.userId,
    userName: record.userName,
    purchaseOrder: record.purchaseOrder || null,
    patient: record.patient || null,
    prescription: record.prescription || null,
    dispensing: record.dispensing || null,
    fromLocation: record.fromLocation || '',
    toLocation: record.toLocation || '',
    createdAt: record.createdAt,
  };
}

export default mongoose.models.StockMovement || mongoose.model('StockMovement', stockMovementSchema);
