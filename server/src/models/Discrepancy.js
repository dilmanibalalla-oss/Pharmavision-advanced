import mongoose from 'mongoose';

export const ALERT_STATUSES = ['PENDING', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED'];
export const ALERT_KINDS = ['MISSING', 'UNEXPECTED', 'WRONG_SHELF', 'REPEATED', 'QUANTITY_DIFFERENCE'];

const noteSchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, default: '' },
    text: { type: String, required: true },
  },
  { _id: false }
);

const evidenceSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['scan', 'movement', 'note'], required: true },
    ref: { type: String, default: '' },
    label: { type: String, default: '' },
  },
  { _id: true }
);

const discrepancySchema = new mongoose.Schema(
  {
    alertCode: { type: String, trim: true },
    kind: { type: String, enum: ALERT_KINDS, required: true },
    shelf: { type: mongoose.Schema.Types.ObjectId, ref: 'Shelf', default: null },
    shelfCode: { type: String, default: '' },
    shelfName: { type: String, default: '' },
    section: { type: String, default: '' },
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', default: null },
    medicineName: { type: String, default: '' },
    expectedQuantity: { type: Number, default: 0 },
    observedQuantity: { type: Number, default: 0 },
    difference: { type: Number, default: 0 },
    scan: { type: mongoose.Schema.Types.ObjectId, ref: 'Scan', default: null },
    movements: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StockMovement' }],
    detectedAt: { type: Date, required: true },
    status: { type: String, enum: ALERT_STATUSES, default: 'PENDING' },
    investigator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    investigatorName: { type: String, default: '' },
    notes: { type: [noteSchema], default: [] },
    evidence: { type: [evidenceSchema], default: [] },
    resolution: { type: String, default: '' },
    statement: { type: String, default: '' },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

discrepancySchema.index({ alertCode: 1 }, { unique: true, sparse: true });
discrepancySchema.index({ status: 1, detectedAt: -1 });
discrepancySchema.index({ shelf: 1, medicine: 1, kind: 1 });
discrepancySchema.index({ scan: 1, medicine: 1, kind: 1 });

export const REVIEW_STATEMENT = 'The observed count differs from the batch stock on record. This is a discrepancy for a person to review. It is not a finding about any employee.';

export function presentAlert(record) {
  return {
    _id: record._id,
    alertCode: record.alertCode || '',
    kind: record.kind,
    shelf: record.shelf || null,
    shelfCode: record.shelfCode || '',
    shelfName: record.shelfName || '',
    section: record.section || '',
    medicine: record.medicine || null,
    medicineName: record.medicineName || '',
    expectedQuantity: record.expectedQuantity || 0,
    observedQuantity: record.observedQuantity || 0,
    difference: record.difference || 0,
    scan: record.scan || null,
    movements: record.movements || [],
    detectedAt: record.detectedAt,
    status: record.status,
    investigator: record.investigator || null,
    investigatorName: record.investigatorName || '',
    notes: record.notes || [],
    evidence: record.evidence || [],
    resolution: record.resolution || '',
    statement: record.statement || REVIEW_STATEMENT,
    closedBy: record.closedBy || null,
    closedAt: record.closedAt || null,
    createdAt: record.createdAt,
  };
}

export default mongoose.models.Discrepancy || mongoose.model('Discrepancy', discrepancySchema);
