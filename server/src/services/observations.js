import mongoose from 'mongoose';
import Medicine from '../models/Medicine.js';
import { cleanText } from '../validate.js';

const LOW_CONFIDENCE = 0.6;

function numberIn(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return number;
}

export async function readObservations(rows) {
  if (!Array.isArray(rows)) return { error: 'Detection results must be a list' };
  if (rows.length > 40) return { error: 'A scan can include at most 40 detections' };
  const observations = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') return { error: 'A detection result could not be read' };
    const confidence = numberIn(row.confidence ?? 0, 0, 1);
    const count = numberIn(row.count ?? 0, 0, 100000);
    if (confidence == null || count == null || !Number.isInteger(count)) {
      return { error: 'Each detection needs a count and a confidence between 0 and 1' };
    }
    const box = row.boundingBox || {};
    const boundingBox = {
      x: numberIn(box.x ?? 0, 0, 100000) ?? 0,
      y: numberIn(box.y ?? 0, 0, 100000) ?? 0,
      width: numberIn(box.width ?? 0, 0, 100000) ?? 0,
      height: numberIn(box.height ?? 0, 0, 100000) ?? 0,
    };
    const label = cleanText(row.label || row.name, 120);
    let medicine = null;
    const medicineId = cleanText(row.medicineId || row.medicine, 40);
    const medicineCode = cleanText(row.medicineCode, 40);
    const barcode = cleanText(row.barcode, 40);
    if (medicineId && mongoose.isValidObjectId(medicineId)) {
      medicine = await Medicine.findById(medicineId);
    } else if (medicineCode) {
      medicine = await Medicine.findOne({ medicineCode });
    } else if (barcode) {
      medicine = await Medicine.findOne({ barcode });
    }
    const unknown = !medicine;
    observations.push({
      medicine: medicine?._id || null,
      medicineName: medicine?.name || '',
      label: label || (unknown ? 'Unrecognized product' : medicine.name),
      section: cleanText(row.section, 20).toUpperCase(),
      count,
      confidence,
      boundingBox,
      unknown,
      lowConfidence: confidence < LOW_CONFIDENCE,
    });
  }
  return { observations };
}
