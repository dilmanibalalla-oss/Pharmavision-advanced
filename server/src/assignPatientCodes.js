import Counter from './models/Counter.js';
import Patient from './models/Patient.js';

function codeFor(seq) {
  return `PT-${String(seq).padStart(6, '0')}`;
}

async function highestSequence() {
  const highest = await Patient.findOne({ patientCode: /^PT-\d{6}$/ })
    .sort({ patientCode: -1 })
    .select('patientCode');
  return highest ? Number(highest.patientCode.slice(3)) : 0;
}

export async function allocatePatientCode() {
  const counter = await Counter.findOneAndUpdate(
    { _id: 'patient' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return codeFor(counter.seq);
}

export async function assignPatientCodes() {
  const missing = await Patient.find({
    $or: [{ patientCode: { $exists: false } }, { patientCode: null }, { patientCode: '' }],
  }).sort({ createdAt: 1, _id: 1 }).select('_id');

  let seq = Math.max((await Counter.findById('patient'))?.seq || 0, await highestSequence());
  if (missing.length === 0) {
    await Counter.updateOne({ _id: 'patient' }, { $max: { seq } }, { upsert: true });
    return;
  }

  const ops = missing.map((patient) => {
    seq += 1;
    return {
      updateOne: {
        filter: { _id: patient._id },
        update: { $set: { patientCode: codeFor(seq) } },
      },
    };
  });
  await Patient.bulkWrite(ops);
  await Counter.updateOne({ _id: 'patient' }, { $set: { seq } }, { upsert: true });
}
