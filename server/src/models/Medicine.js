import mongoose from 'mongoose';

const medicineSchema = new mongoose.Schema(
  {
    medicineCode: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    genericName: { type: String, default: '', trim: true },
    activeIngredient: { type: String, default: '', trim: true },
    strength: { type: String, default: '', trim: true },
    form: { type: String, required: true, trim: true },
    category: { type: String, default: '', trim: true },
    manufacturer: { type: String, default: '', trim: true },
    barcode: { type: String, trim: true },
    description: { type: String, default: '', maxlength: 2000 },
    storageInstructions: { type: String, default: '', maxlength: 500 },
    prescriptionRequired: { type: Boolean, default: false },
    minimumStock: { type: Number, min: 0, default: 0 },
    active: { type: Boolean, default: true },
    quantity: { type: Number, min: 0 },
    unitCost: { type: Number, min: 0 },
    reorderLevel: { type: Number, min: 0 },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

medicineSchema.index({ name: 1, strength: 1, form: 1 }, { unique: true });
medicineSchema.index({ medicineCode: 1 }, { unique: true, sparse: true });
medicineSchema.index(
  { barcode: 1 },
  { unique: true, partialFilterExpression: { barcode: { $type: 'string', $gt: '' } } }
);
medicineSchema.index({ genericName: 1, name: 1 });
medicineSchema.index({ category: 1, form: 1 });

export function presentMedicine(record) {
  return {
    _id: record._id,
    medicineCode: record.medicineCode || '',
    name: record.name,
    brandName: record.name,
    genericName: record.genericName || '',
    activeIngredient: record.activeIngredient || '',
    strength: record.strength || '',
    form: record.form,
    category: record.category || '',
    manufacturer: record.manufacturer || '',
    barcode: record.barcode || '',
    description: record.description || '',
    storageInstructions: record.storageInstructions || '',
    prescriptionRequired: record.prescriptionRequired === true,
    minimumStock: record.minimumStock || record.reorderLevel || 0,
    active: record.active !== false,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export default mongoose.models.Medicine || mongoose.model('Medicine', medicineSchema);
