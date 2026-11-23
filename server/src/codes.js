import Counter from './models/Counter.js';
import Medicine from './models/Medicine.js';

export async function allocateCode(key, prefix, session) {
  const options = { new: true, upsert: true };
  if (session) options.session = session;
  const counter = await Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, options);
  return `${prefix}-${String(counter.seq).padStart(6, '0')}`;
}

function codeFor(seq) {
  return `MED-${String(seq).padStart(6, '0')}`;
}

export async function assignMedicineCodes() {
  const missing = await Medicine.find({
    $or: [{ medicineCode: { $exists: false } }, { medicineCode: null }, { medicineCode: '' }],
  }).sort({ createdAt: 1, _id: 1 }).select('_id');
  const highest = await Medicine.findOne({ medicineCode: /^MED-\d{6}$/ }).sort({ medicineCode: -1 }).select('medicineCode');
  let seq = Math.max((await Counter.findById('medicine'))?.seq || 0, highest ? Number(highest.medicineCode.slice(4)) : 0);
  if (missing.length === 0) {
    await Counter.updateOne({ _id: 'medicine' }, { $max: { seq } }, { upsert: true });
    return;
  }
  const ops = missing.map((medicine) => {
    seq += 1;
    return {
      updateOne: {
        filter: { _id: medicine._id },
        update: { $set: { medicineCode: codeFor(seq) } },
      },
    };
  });
  await Medicine.bulkWrite(ops);
  await Counter.updateOne({ _id: 'medicine' }, { $set: { seq } }, { upsert: true });
}
