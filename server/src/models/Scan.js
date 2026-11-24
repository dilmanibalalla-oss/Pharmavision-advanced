import mongoose from 'mongoose';

const boxSchema = new mongoose.Schema(
  {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
  },
  { _id: false }
);

const observationSchema = new mongoose.Schema(
  {
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', default: null },
    medicineName: { type: String, default: '' },
    label: { type: String, default: '' },
    section: { type: String, default: '' },
    count: { type: Number, default: 0 },
    confidence: { type: Number, default: 0 },
    boundingBox: { type: boxSchema, default: () => ({}) },
    unknown: { type: Boolean, default: false },
    lowConfidence: { type: Boolean, default: false },
  },
  { _id: true }
);

const scanSchema = new mongoose.Schema(
  {
    scanCode: { type: String, trim: true },
    requestId: { type: String, trim: true },
    shelf: { type: mongoose.Schema.Types.ObjectId, ref: 'Shelf', required: true },
    shelfCode: { type: String, default: '' },
    shelfName: { type: String, default: '' },
    section: { type: String, default: '' },
    status: { type: String, enum: ['RECEIVED', 'PENDING_AI', 'OBSERVED', 'REJECTED'], default: 'RECEIVED' },
    recognition: {
      connected: { type: Boolean, default: false },
      performed: { type: Boolean, default: false },
      message: { type: String, default: '' },
    },
    observations: { type: [observationSchema], default: [] },
    device: {
      platform: { type: String, default: '' },
      os: { type: String, default: '' },
      model: { type: String, default: '' },
      appVersion: { type: String, default: '' },
    },
    imageMime: { type: String, default: '' },
    imageSize: { type: Number, default: 0 },
    imageHash: { type: String, default: '' },
    image: { type: Buffer, select: false },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: { type: String, default: '' },
    review: {
      status: { type: String, enum: ['UNREVIEWED', 'CONFIRMED'], default: 'UNREVIEWED' },
      note: { type: String, default: '' },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      reviewedByName: { type: String, default: '' },
      reviewedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

scanSchema.index({ requestId: 1 }, { unique: true, sparse: true });
scanSchema.index({ shelf: 1, createdAt: -1 });
scanSchema.index({ createdAt: -1 });

export function presentObservation(item) {
  return {
    _id: item._id,
    medicine: item.medicine || null,
    medicineName: item.medicineName || '',
    label: item.label || '',
    section: item.section || '',
    count: item.count || 0,
    confidence: item.confidence || 0,
    boundingBox: item.boundingBox || { x: 0, y: 0, width: 0, height: 0 },
    unknown: item.unknown === true,
    lowConfidence: item.lowConfidence === true,
  };
}

export function presentScan(record) {
  return {
    _id: record._id,
    scanCode: record.scanCode || '',
    requestId: record.requestId || '',
    shelf: record.shelf,
    shelfCode: record.shelfCode || '',
    shelfName: record.shelfName || '',
    section: record.section || '',
    status: record.status,
    recognition: record.recognition || { connected: false, performed: false, message: '' },
    observations: (record.observations || []).map(presentObservation),
    device: record.device || {},
    imageStored: Boolean(record.imageSize),
    imageMime: record.imageMime || '',
    imageSize: record.imageSize || 0,
    user: record.user || null,
    userName: record.userName || '',
    review: {
      status: record.review?.status || 'UNREVIEWED',
      note: record.review?.note || '',
      reviewedBy: record.review?.reviewedBy || null,
      reviewedByName: record.review?.reviewedByName || '',
      reviewedAt: record.review?.reviewedAt || null,
    },
    createdAt: record.createdAt,
  };
}

export default mongoose.models.Scan || mongoose.model('Scan', scanSchema);
