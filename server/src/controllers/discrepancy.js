import mongoose from 'mongoose';
import Batch from '../models/Batch.js';
import StockMovement from '../models/StockMovement.js';
import Medicine from '../models/Medicine.js';
import Discrepancy, { REVIEW_STATEMENT } from '../models/Discrepancy.js';
import { allocateCode } from '../codes.js';

async function onHand(ids) {
  if (ids.length === 0) return new Map();
  const rows = await Batch.aggregate([
    {
      $match: {
        medicine: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
        remainingQuantity: { $gt: 0 },
      },
    },
    { $group: { _id: '$medicine', total: { $sum: '$remainingQuantity' } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.total]));
}

function observedMap(scan) {
  const map = new Map();
  for (const item of scan.observations || []) {
    if (!item.medicine || item.unknown || item.lowConfidence) continue;
    const id = String(item.medicine);
    const current = map.get(id) || { count: 0, sections: new Set(), name: item.medicineName };
    current.count += item.count || 0;
    if (item.section) current.sections.add(item.section);
    map.set(id, current);
  }
  return map;
}

export async function reviewShelf(shelf, scan) {
  if (!scan || scan.status !== 'OBSERVED') return [];
  const assigned = new Map();
  for (const section of shelf.sections || []) {
    for (const item of section.medicines || []) {
      const id = String(item.medicine);
      const current = assigned.get(id) || { sections: [], name: item.medicineName };
      current.sections.push(section.code);
      assigned.set(id, current);
    }
  }
  const seen = observedMap(scan);
  const ids = [...new Set([...assigned.keys(), ...seen.keys()])];
  const stock = await onHand(ids);
  const drafts = [];

  for (const [id, placement] of assigned) {
    const expected = stock.get(id) || 0;
    const observation = seen.get(id);
    const observed = observation?.count ?? 0;
    if (observed < expected) {
      drafts.push({
        kind: 'MISSING',
        medicine: id,
        medicineName: placement.name,
        expected,
        observed,
        section: placement.sections[0] || '',
      });
    } else if (observed > expected) {
      drafts.push({
        kind: 'QUANTITY_DIFFERENCE',
        medicine: id,
        medicineName: placement.name,
        expected,
        observed,
        section: placement.sections[0] || '',
      });
    }
    if (observation) {
      for (const section of observation.sections) {
        if (!placement.sections.includes(section)) {
          drafts.push({
            kind: 'WRONG_SHELF',
            medicine: id,
            medicineName: placement.name,
            expected,
            observed: observation.count,
            section,
          });
        }
      }
    }
  }

  for (const [id, observation] of seen) {
    if (!assigned.has(id)) {
      drafts.push({
        kind: 'UNEXPECTED',
        medicine: id,
        medicineName: observation.name,
        expected: stock.get(id) || 0,
        observed: observation.count,
        section: [...observation.sections][0] || scan.section || '',
      });
    }
  }

  for (const item of scan.observations || []) {
    if (!item.unknown) continue;
    drafts.push({
      kind: 'UNEXPECTED',
      medicine: null,
      medicineName: item.label || 'Unrecognized product',
      expected: 0,
      observed: item.count || 0,
      section: item.section || scan.section || '',
    });
  }

  const created = [];
  for (const draft of drafts) {
    const repeated = await Discrepancy.exists({
      shelf: shelf._id,
      kind: draft.kind,
      medicine: draft.medicine,
      _id: { $exists: true },
    });
    const kind = repeated ? 'REPEATED' : draft.kind;
    const already = await Discrepancy.findOne({ scan: scan._id, kind, medicine: draft.medicine, section: draft.section });
    if (already) {
      created.push(already);
      continue;
    }
    const movements = draft.medicine
      ? await StockMovement.find({ medicine: draft.medicine }).sort({ createdAt: -1 }).limit(8).select('_id')
      : [];
    const medicine = draft.medicine ? await Medicine.findById(draft.medicine).select('name') : null;
    const alert = await Discrepancy.create({
      alertCode: await allocateCode('alert', 'ALT'),
      kind,
      shelf: shelf._id,
      shelfCode: shelf.shelfCode || '',
      shelfName: shelf.name,
      section: draft.section,
      medicine: draft.medicine,
      medicineName: medicine?.name || draft.medicineName || '',
      expectedQuantity: draft.expected,
      observedQuantity: draft.observed,
      difference: draft.observed - draft.expected,
      scan: scan._id,
      movements: movements.map((row) => row._id),
      detectedAt: new Date(),
      status: 'PENDING',
      statement: REVIEW_STATEMENT,
      evidence: [
        { kind: 'scan', ref: String(scan._id), label: scan.scanCode || 'Shelf scan' },
        ...movements.map((row) => ({ kind: 'movement', ref: String(row._id), label: 'Related stock movement' })),
      ],
    });
    created.push(alert);
  }
  return created;
}
