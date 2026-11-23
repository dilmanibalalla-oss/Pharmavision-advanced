import mongoose from 'mongoose';

const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    strength: { type: String, default: '', trim: true },
    form: { type: String, required: true, trim: true },
    quantity: { type: Number, min: 0 },
    unitCost: { type: Number, min: 0 },
    reorderLevel: { type: Number, min: 0 },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

medicineSchema.index({ name: 1, strength: 1, form: 1 }, { unique: true });

export default mongoose.models.Medicine || mongoose.model('Medicine', medicineSchema);
