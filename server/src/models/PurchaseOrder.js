import mongoose from 'mongoose';

export const PO_STATUSES = ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'];

const itemSchema = new mongoose.Schema(
  {
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
    medicineName: { type: String, required: true },
    strength: { type: String, default: '' },
    form: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    receivedQuantity: { type: Number, default: 0, min: 0 },
    unitCost: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const auditSchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    action: { type: String, required: true },
    note: { type: String, default: '' },
  },
  { _id: false }
);

const purchaseOrderSchema = new mongoose.Schema(
  {
    orderCode: { type: String, trim: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    supplierName: { type: String, required: true },
    supplierCode: { type: String, default: '' },
    orderDate: { type: Date, required: true },
    expectedDelivery: { type: Date, default: null },
    items: { type: [itemSchema], default: [] },
    totalAmount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: PO_STATUSES, default: 'ORDERED', required: true },
    audit: { type: [auditSchema], default: [] },
  },
  { timestamps: true }
);

purchaseOrderSchema.index({ orderCode: 1 }, { unique: true, sparse: true });
purchaseOrderSchema.index({ supplier: 1, orderDate: -1 });
purchaseOrderSchema.index({ status: 1, orderDate: -1 });

export function lineTotal(item) {
  return Math.round(item.quantity * item.unitCost * 100) / 100;
}

export function orderTotal(items) {
  return Math.round(items.reduce((sum, item) => sum + lineTotal(item), 0) * 100) / 100;
}

export function presentOrder(record, detail = false) {
  const items = (record.items || []).map((item) => ({
    _id: item._id,
    medicine: item.medicine,
    medicineName: item.medicineName,
    strength: item.strength || '',
    form: item.form || '',
    quantity: item.quantity,
    receivedQuantity: item.receivedQuantity || 0,
    outstanding: item.quantity - (item.receivedQuantity || 0),
    unitCost: item.unitCost,
    lineTotal: lineTotal(item),
  }));
  const view = {
    _id: record._id,
    orderCode: record.orderCode || '',
    supplier: record.supplier,
    supplierName: record.supplierName,
    supplierCode: record.supplierCode || '',
    orderDate: record.orderDate,
    expectedDelivery: record.expectedDelivery || null,
    itemCount: items.length,
    totalAmount: record.totalAmount,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
  if (!detail) return view;
  return { ...view, items, audit: record.audit || [] };
}

export default mongoose.models.PurchaseOrder || mongoose.model('PurchaseOrder', purchaseOrderSchema);
