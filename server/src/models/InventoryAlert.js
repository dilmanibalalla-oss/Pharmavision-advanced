import mongoose from 'mongoose';

const inventoryAlertSchema = new mongoose.Schema(
  {
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', default: null },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null },
    type: { type: String, enum: ['low-stock', 'near-expiry', 'expired'], required: true },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
    title: { type: String, required: true },
    reason: { type: String, default: '' },
  },
  { timestamps: true }
);

inventoryAlertSchema.index({ type: 1, status: 1, medicine: 1 });

export default mongoose.models.InventoryAlert || mongoose.model('InventoryAlert', inventoryAlertSchema);
