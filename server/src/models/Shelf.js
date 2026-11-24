import mongoose from 'mongoose';

const pointSchema = new mongoose.Schema(
  { x: { type: Number, required: true }, y: { type: Number, required: true }, z: { type: Number, default: 0 } },
  { _id: false }
);

const sectionSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    medicines: [{
      medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
      medicineName: { type: String, default: '' },
    }],
  },
  { _id: true }
);

const shelfSchema = new mongoose.Schema(
  {
    shelfCode: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    sections: { type: [sectionSchema], default: [] },
    boundary: {
      unit: { type: String, default: 'm' },
      width: { type: Number, default: 0 },
      height: { type: Number, default: 0 },
      depth: { type: Number, default: 0 },
      points: { type: [pointSchema], default: [] },
    },
    coordinateSystem: {
      name: { type: String, default: 'shelf-local' },
      handedness: { type: String, default: 'right' },
      up: { type: String, default: 'y' },
      unit: { type: String, default: 'm' },
      origin: { x: { type: Number, default: 0 }, y: { type: Number, default: 0 }, z: { type: Number, default: 0 } },
    },
    device: {
      platform: { type: String, default: '' },
      os: { type: String, default: '' },
      model: { type: String, default: '' },
      appVersion: { type: String, default: '' },
    },
    calibration: {
      status: { type: String, enum: ['UNSET', 'MANUAL', 'TRACKED'], default: 'UNSET' },
      method: { type: String, default: '' },
    },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String, default: '' },
    lastScanAt: { type: Date, default: null },
  },
  { timestamps: true }
);

shelfSchema.index({ shelfCode: 1 }, { unique: true, sparse: true });
shelfSchema.index({ status: 1, name: 1 });
shelfSchema.index({ location: 1 });

export function presentShelf(record) {
  const sections = (record.sections || []).map((section) => ({
    _id: section._id,
    code: section.code,
    name: section.name,
    medicines: (section.medicines || []).map((item) => ({
      medicine: item.medicine,
      medicineName: item.medicineName || '',
    })),
  }));
  return {
    _id: record._id,
    shelfCode: record.shelfCode || '',
    name: record.name,
    location: record.location,
    sections,
    boundary: record.boundary || { unit: 'm', width: 0, height: 0, depth: 0, points: [] },
    coordinateSystem: record.coordinateSystem || { name: 'shelf-local', handedness: 'right', up: 'y', unit: 'm' },
    device: record.device || { platform: '', os: '', model: '', appVersion: '' },
    calibration: {
      status: record.calibration?.status || 'UNSET',
      method: record.calibration?.method || '',
    },
    status: record.status,
    createdBy: record.createdBy || null,
    createdByName: record.createdByName || '',
    lastScanAt: record.lastScanAt || null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    flutter: {
      shelfId: record.shelfCode || '',
      name: record.name,
      location: record.location,
      sections,
      boundary: record.boundary,
      coordinateSystem: record.coordinateSystem,
      status: record.status,
    },
  };
}

export default mongoose.models.Shelf || mongoose.model('Shelf', shelfSchema);
