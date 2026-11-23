import mongoose from 'mongoose';

const receiptSchema = new mongoose.Schema(
  {
    requestId: { type: String, required: true, unique: true, trim: true },
    status: { type: String, enum: ['pending', 'posted'], default: 'pending' },
    purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    lines: {
      type: [{
        medicine: mongoose.Schema.Types.ObjectId,
        batch: mongoose.Schema.Types.ObjectId,
        batchNumber: String,
        quantity: Number,
        expiryDate: Date,
        storageLocation: String,
        movement: mongoose.Schema.Types.ObjectId,
      }],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.models.Receipt || mongoose.model('Receipt', receiptSchema);
