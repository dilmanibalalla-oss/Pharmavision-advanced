import mongoose from 'mongoose';
import Medicine from '../models/Medicine.js';
import Batch, { presentBatch } from '../models/Batch.js';
import StockMovement from '../models/StockMovement.js';
import PurchaseOrder from '../models/PurchaseOrder.js';
import Receipt from '../models/Receipt.js';
import Dispensing, { PrescriptionFill, presentDispensing } from '../models/Dispensing.js';
import InventoryAlert from '../models/InventoryAlert.js';
import Patient from '../models/Patient.js';
import { allocateCode } from '../codes.js';
import { cleanText, dayStamp, parseQuantity } from '../validate.js';

export class StockError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function withSession(session) {
  return session ? { session } : {};
}

export async function runTxn(work) {
  let session;
  try {
    session = await mongoose.startSession();
  } catch {
    return work(null);
  }
  try {
    let value;
    await session.withTransaction(async () => {
      value = await work(session);
    });
    return value;
  } catch (error) {
    const message = String(error?.message || '');
    if (
      message.includes('Transaction numbers are only allowed')
      || message.includes('replica set')
      || error?.code === 20
      || error?.codeName === 'IllegalOperation'
    ) {
      return work(null);
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

function startOfToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
}

export function isExpired(date, today = startOfToday()) {
  return dayStamp(date) < dayStamp(today);
}

async function availableBatches(medicineId, session) {
  const today = startOfToday();
  return Batch.find({
    medicine: medicineId,
    remainingQuantity: { $gt: 0 },
    status: 'AVAILABLE',
    expiryDate: { $gte: today },
  }).sort({ expiryDate: 1, createdAt: 1 }).session(session || null);
}

export async function planFefo(medicineId, quantity) {
  const parsed = parseQuantity(quantity, 'Quantity');
  if (parsed.error) throw new StockError(parsed.error);
  const batches = await availableBatches(medicineId, null);
  let needed = parsed.quantity;
  const allocations = [];
  for (const batch of batches) {
    if (needed <= 0) break;
    const take = Math.min(batch.remainingQuantity, needed);
    allocations.push({
      batch: batch._id,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      storageLocation: batch.storageLocation,
      quantity: take,
      remainingQuantity: batch.remainingQuantity,
    });
    needed -= take;
  }
  return {
    quantity: parsed.quantity,
    available: parsed.quantity - needed,
    enough: needed === 0,
    allocations,
  };
}

async function takeFromBatch(batchId, quantity, session) {
  const updated = await Batch.findOneAndUpdate(
    { _id: batchId, remainingQuantity: { $gte: quantity } },
    { $inc: { remainingQuantity: -quantity } },
    { new: true, ...withSession(session) }
  );
  if (!updated) throw new StockError('That batch no longer has enough stock');
  if (updated.remainingQuantity === 0 && updated.status === 'AVAILABLE') {
    updated.status = 'DEPLETED';
    await updated.save(withSession(session));
  }
  return updated;
}

async function addToBatch(batchId, quantity, session) {
  const updated = await Batch.findByIdAndUpdate(
    batchId,
    { $inc: { remainingQuantity: quantity }, $set: { status: 'AVAILABLE' } },
    { new: true, ...withSession(session) }
  );
  if (!updated) throw new StockError('Batch not found', 404);
  return updated;
}

async function writeMovement(fields, session) {
  const [movement] = await StockMovement.create([{
    ...fields,
    movementCode: await allocateCode('movement', 'MOV', session),
  }], withSession(session));
  return movement;
}

async function rememberLowStock(medicineId) {
  const medicine = await Medicine.findById(medicineId).select('name minimumStock reorderLevel');
  if (!medicine) return;
  const minimum = medicine.minimumStock || medicine.reorderLevel || 0;
  if (minimum <= 0) return;
  const [sum] = await Batch.aggregate([
    { $match: { medicine: medicine._id, remainingQuantity: { $gt: 0 } } },
    { $group: { _id: null, total: { $sum: '$remainingQuantity' } } },
  ]);
  const total = sum?.total || 0;
  if (total > minimum) {
    await InventoryAlert.updateMany(
      { medicine: medicine._id, type: 'low-stock', status: 'open' },
      { status: 'resolved' }
    );
    return;
  }
  const open = await InventoryAlert.findOne({ medicine: medicine._id, type: 'low-stock', status: 'open' });
  if (open) return;
  await InventoryAlert.create({
    medicine: medicine._id,
    type: 'low-stock',
    status: 'open',
    title: `${medicine.name} is down to ${total}`,
    reason: `On-hand quantity is at or below the minimum of ${minimum}`,
  });
}

function presentReceipt(receipt, order) {
  return {
    _id: receipt._id,
    requestId: receipt.requestId,
    purchaseOrder: receipt.purchaseOrder,
    orderCode: order?.orderCode || '',
    status: order?.status || '',
    totalAmount: order?.totalAmount || 0,
    lines: (receipt.lines || []).map((line) => ({
      medicine: line.medicine,
      batch: line.batch,
      batchNumber: line.batchNumber,
      quantity: line.quantity,
      expiryDate: line.expiryDate,
      storageLocation: line.storageLocation || '',
    })),
    replay: false,
  };
}

export async function receiveOrder(orderId, body, user) {
  const requestId = cleanText(body.requestId, 80);
  if (requestId.length < 8) throw new StockError('A receipt reference is required');
  const posted = await Receipt.findOne({ requestId, status: 'posted' });
  if (posted) {
    const order = await PurchaseOrder.findById(posted.purchaseOrder);
    return { ...presentReceipt(posted, order), replay: true };
  }

  if (!mongoose.isValidObjectId(orderId)) throw new StockError('Purchase order not found', 404);
  const preview = await PurchaseOrder.findById(orderId);
  if (!preview) throw new StockError('Purchase order not found', 404);
  if (!['ORDERED', 'PARTIALLY_RECEIVED'].includes(preview.status)) {
    throw new StockError('That order cannot be received');
  }
  const incoming = Array.isArray(body.batches) ? body.batches : [];
  if (incoming.length === 0 || incoming.length > 40) throw new StockError('Add the batches being received');

  const prepared = [];
  for (const row of incoming) {
    const quantity = parseQuantity(row.quantity, 'Received quantity');
    if (quantity.error) throw new StockError(quantity.error);
    const batchNumber = cleanText(row.batchNumber, 40);
    const location = cleanText(row.storageLocation, 80);
    if (!batchNumber) throw new StockError('Batch number is required');
    if (!location) throw new StockError('Storage location is required');
    if (!mongoose.isValidObjectId(row.medicine)) throw new StockError('Choose a medicine from the order');
    const item = preview.items.find((entry) => String(entry.medicine) === String(row.medicine));
    if (!item) throw new StockError('That medicine is not on this order');
    const manufacturing = row.manufacturingDate ? new Date(row.manufacturingDate) : null;
    const expiry = row.expiryDate ? new Date(row.expiryDate) : null;
    if (!manufacturing || Number.isNaN(manufacturing.getTime())) throw new StockError('Manufacturing date is not a valid date');
    if (!expiry || Number.isNaN(expiry.getTime())) throw new StockError('Expiry date is not a valid date');
    if (dayStamp(manufacturing) > dayStamp(expiry)) throw new StockError('Expiry date cannot be before the manufacturing date');
    if (dayStamp(manufacturing) > dayStamp(new Date())) throw new StockError('Manufacturing date cannot be in the future');
    if (isExpired(expiry)) throw new StockError('An expired batch cannot be received');
    prepared.push({
      item,
      medicineId: item.medicine,
      quantity: quantity.quantity,
      batchNumber,
      location,
      manufacturing,
      expiry,
    });
  }

  const totals = new Map();
  for (const row of prepared) {
    const key = String(row.medicineId);
    totals.set(key, (totals.get(key) || 0) + row.quantity);
  }
  for (const [medicineId, quantity] of totals) {
    const item = preview.items.find((entry) => String(entry.medicine) === medicineId);
    const outstanding = item.quantity - (item.receivedQuantity || 0);
    if (quantity > outstanding) throw new StockError('Received quantity is higher than the amount still on order');
  }

  let receipt;
  try {
    receipt = await Receipt.create({
      requestId,
      status: 'pending',
      purchaseOrder: preview._id,
      supplier: preview.supplier,
      userId: user._id,
      name: user.name,
      lines: [],
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const winner = await Receipt.findOne({ requestId });
    if (winner?.status === 'posted') {
      const order = await PurchaseOrder.findById(winner.purchaseOrder);
      return { ...presentReceipt(winner, order), replay: true };
    }
    throw new StockError('That receipt is already being recorded', 409);
  }

  try {
    const result = await runTxn(async (session) => {
      const order = await PurchaseOrder.findById(preview._id).session(session || null);
      const lines = [];
      for (const row of prepared) {
        const item = order.items.find((entry) => String(entry.medicine) === String(row.medicineId));
        const outstanding = item.quantity - (item.receivedQuantity || 0);
        if (row.quantity > outstanding) throw new StockError('Received quantity is higher than the amount still on order');
        const existing = await Batch.findOne({
          medicine: row.medicineId,
          batchNumber: row.batchNumber,
          storageLocation: row.location,
        }).session(session || null);
        if (existing) throw new StockError(`Batch ${row.batchNumber} is already stored at ${row.location}`);
        const [batch] = await Batch.create([{
          medicine: row.medicineId,
          medicineName: item.medicineName,
          strength: item.strength,
          form: item.form,
          batchNumber: row.batchNumber,
          manufacturingDate: row.manufacturing,
          expiryDate: row.expiry,
          receivedQuantity: row.quantity,
          remainingQuantity: row.quantity,
          unitCost: item.unitCost,
          purchaseOrder: order._id,
          supplier: order.supplier,
          supplierName: order.supplierName,
          storageLocation: row.location,
          status: 'AVAILABLE',
        }], withSession(session));
        const movement = await writeMovement({
          requestId: `${requestId}:${row.batchNumber}:${row.location}`,
          type: 'PURCHASE',
          direction: 'IN',
          medicine: row.medicineId,
          medicineName: item.medicineName,
          batch: batch._id,
          batchNumber: row.batchNumber,
          quantity: row.quantity,
          balanceAfter: batch.remainingQuantity,
          reason: `Received on ${order.orderCode}`,
          userId: user._id,
          userName: user.name,
          purchaseOrder: order._id,
          supplier: order.supplier,
          toLocation: row.location,
        }, session);
        item.receivedQuantity = (item.receivedQuantity || 0) + row.quantity;
        lines.push({
          medicine: row.medicineId,
          batch: batch._id,
          batchNumber: row.batchNumber,
          quantity: row.quantity,
          expiryDate: row.expiry,
          storageLocation: row.location,
          movement: movement._id,
        });
      }
      const open = order.items.some((item) => (item.receivedQuantity || 0) < item.quantity);
      order.status = open ? 'PARTIALLY_RECEIVED' : 'RECEIVED';
      order.audit.push({
        at: new Date(),
        userId: user._id,
        name: user.name,
        action: 'received',
        note: requestId,
      });
      if (order.audit.length > 50) order.audit = order.audit.slice(-50);
      await order.save(withSession(session));
      receipt.lines = lines;
      receipt.status = 'posted';
      await receipt.save(withSession(session));
      return { receipt, order };
    });
    for (const medicineId of totals.keys()) {
      await rememberLowStock(medicineId);
    }
    return presentReceipt(result.receipt, result.order);
  } catch (error) {
    await Receipt.deleteOne({ _id: receipt._id, status: 'pending' });
    throw error;
  }
}

export async function postMovement(body, user) {
  const requestId = cleanText(body.requestId, 80);
  if (requestId.length < 8) throw new StockError('A movement reference is required');
  const existing = await StockMovement.findOne({ requestId });
  if (existing) return { movement: existing, replay: true };

  const type = cleanText(body.type, 40);
  const allowed = ['RETURN', 'AUTHORIZED_ADJUSTMENT', 'TRANSFER', 'EXPIRED', 'DAMAGED'];
  if (!allowed.includes(type)) throw new StockError('That stock movement is not one of the listed types');
  const quantity = parseQuantity(body.quantity, 'Quantity');
  if (quantity.error) throw new StockError(quantity.error);
  const reason = cleanText(body.reason, 500);
  if (reason.length < 3) throw new StockError('Record the reason for this stock change');
  if (!mongoose.isValidObjectId(body.batch)) throw new StockError('Choose a batch');
  const direction = type === 'TRANSFER' ? 'MOVE' : cleanText(body.direction, 3);
  if (type === 'RETURN' || type === 'AUTHORIZED_ADJUSTMENT') {
    if (direction !== 'IN' && direction !== 'OUT') throw new StockError('Choose whether stock is coming in or going out');
  }
  if ((type === 'EXPIRED' || type === 'DAMAGED') && direction && direction !== 'OUT' && direction !== 'MOVE') {
    // direction is fixed below
  }
  const toLocation = cleanText(body.toLocation, 80);

  const prior = await StockMovement.findOne({ requestId });
  if (prior) return { movement: prior, replay: true };

  const movement = await runTxn(async (session) => {
    const again = await StockMovement.findOne({ requestId }).session(session || null);
    if (again) return { movement: again, replay: true };
    const batch = await Batch.findById(body.batch).session(session || null);
    if (!batch) throw new StockError('Batch not found', 404);
    let balance = batch.remainingQuantity;
    let saved = batch;

    if (type === 'TRANSFER') {
      if (!toLocation) throw new StockError('Choose the location that will receive the stock');
      if (toLocation === batch.storageLocation) throw new StockError('Choose a different storage location');
      if (quantity.quantity > batch.remainingQuantity) throw new StockError('That batch does not have enough stock');
      const destination = await Batch.findOne({
        medicine: batch.medicine,
        batchNumber: batch.batchNumber,
        storageLocation: toLocation,
      }).session(session || null);
      saved = await takeFromBatch(batch._id, quantity.quantity, session);
      if (destination) {
        if (isExpired(destination.expiryDate)) throw new StockError('That location already holds an expired batch');
        await addToBatch(destination._id, quantity.quantity, session);
      } else {
        await Batch.create([{
          medicine: batch.medicine,
          medicineName: batch.medicineName,
          strength: batch.strength,
          form: batch.form,
          batchNumber: batch.batchNumber,
          manufacturingDate: batch.manufacturingDate,
          expiryDate: batch.expiryDate,
          receivedQuantity: quantity.quantity,
          remainingQuantity: quantity.quantity,
          unitCost: batch.unitCost,
          purchaseOrder: batch.purchaseOrder,
          supplier: batch.supplier,
          supplierName: batch.supplierName,
          storageLocation: toLocation,
          status: isExpired(batch.expiryDate) ? 'EXPIRED' : 'AVAILABLE',
        }], withSession(session));
      }
      balance = saved.remainingQuantity;
    } else if (type === 'EXPIRED' || type === 'DAMAGED' || direction === 'OUT') {
      if (type === 'EXPIRED' && quantity.quantity !== batch.remainingQuantity) {
        throw new StockError('Expire the whole remaining quantity of the batch');
      }
      if (isExpired(batch.expiryDate) && type !== 'EXPIRED' && type !== 'DAMAGED' && type !== 'RETURN') {
        throw new StockError('That batch is expired');
      }
      if (type === 'EXPIRED' && !isExpired(batch.expiryDate) && dayStamp(batch.expiryDate) >= dayStamp(startOfToday())) {
        throw new StockError('That batch has not reached its expiry date');
      }
      if (type === 'RETURN' && direction === 'IN') {
        if (isExpired(batch.expiryDate)) throw new StockError('An expired batch cannot be returned to stock');
        saved = await addToBatch(batch._id, quantity.quantity, session);
      } else {
        saved = await takeFromBatch(batch._id, quantity.quantity, session);
        if (type === 'EXPIRED') saved.status = 'EXPIRED';
        if (type === 'DAMAGED' && saved.remainingQuantity === 0) saved.status = 'DAMAGED';
        await saved.save(withSession(session));
      }
      balance = saved.remainingQuantity;
    } else {
      if (isExpired(batch.expiryDate)) throw new StockError('An expired batch cannot be returned to stock');
      saved = await addToBatch(batch._id, quantity.quantity, session);
      balance = saved.remainingQuantity;
    }

    const out = type === 'TRANSFER' ? 'MOVE' : (type === 'EXPIRED' || type === 'DAMAGED' ? 'OUT' : direction);
    const created = await writeMovement({
      requestId,
      type,
      direction: out,
      medicine: batch.medicine,
      medicineName: batch.medicineName,
      batch: batch._id,
      batchNumber: batch.batchNumber,
      quantity: quantity.quantity,
      balanceAfter: balance,
      reason,
      userId: user._id,
      userName: user.name,
      purchaseOrder: batch.purchaseOrder,
      supplier: batch.supplier,
      fromLocation: batch.storageLocation,
      toLocation: type === 'TRANSFER' ? toLocation : '',
    }, session);
    return { movement: created, replay: false, medicineId: batch.medicine };
  });

  if (!movement.replay) await rememberLowStock(movement.medicineId);
  return movement;
}

async function findLine(patientId, prescriptionId, session) {
  const patient = await Patient.findById(patientId).session(session || null);
  if (!patient) throw new StockError('Patient not found', 404);
  for (const visit of patient.visits || []) {
    const line = visit.treatments.id(prescriptionId);
    if (line) return { patient, line };
  }
  throw new StockError('Prescription not found', 404);
}

export async function dispense(body, user) {
  const requestId = cleanText(body.requestId, 80);
  if (requestId.length < 8) throw new StockError('A dispensing reference is required');
  const existing = await Dispensing.findOne({ requestId, status: 'posted' });
  if (existing) return { ...presentDispensing(existing), replay: true };

  if (!mongoose.isValidObjectId(body.patient) || !mongoose.isValidObjectId(body.prescription)) {
    throw new StockError('Choose a prescription');
  }
  const quantity = parseQuantity(body.quantity, 'Dispensed quantity');
  if (quantity.error) throw new StockError(quantity.error);

  const { patient, line } = await findLine(body.patient, body.prescription, null);
  if (String(patient._id) !== String(body.patient)) throw new StockError('That prescription belongs to a different patient');
  const medicine = await Medicine.findById(line.medicine);
  if (!medicine) throw new StockError('That medicine is no longer in the catalog');

  let record;
  try {
    record = await Dispensing.create({
      requestId,
      status: 'pending',
      patient: patient._id,
      patientName: patient.name,
      patientCode: patient.patientCode || '',
      prescription: line._id,
      pharmacist: user._id,
      pharmacistName: user.name,
      medicine: medicine._id,
      medicineName: line.medicineName,
      strength: line.strength || '',
      form: line.form || '',
      quantity: quantity.quantity,
      prescribedQuantity: Number.isInteger(line.quantity) ? line.quantity : quantity.quantity,
      dispensedQuantity: quantity.quantity,
      allocations: [],
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const winner = await Dispensing.findOne({ requestId });
    if (winner?.status === 'posted') return { ...presentDispensing(winner), replay: true };
    throw new StockError('That dispensing request is already being recorded', 409);
  }

  try {
    const saved = await runTxn(async (session) => {
      const fresh = await findLine(patient._id, line._id, session);
      let fill = await PrescriptionFill.findOne({ prescription: line._id }).session(session || null);
      let prescribed = Number.isInteger(fresh.line.quantity) ? fresh.line.quantity : null;
      if (fill) prescribed = fill.prescribedQuantity;
      if (!prescribed) {
        const given = parseQuantity(body.prescribedQuantity, 'Prescribed quantity');
        if (given.error) throw new StockError('Enter the prescribed quantity before dispensing');
        prescribed = given.quantity;
      }
      if (body.prescribedQuantity != null && body.prescribedQuantity !== '' && fill) {
        const given = parseQuantity(body.prescribedQuantity, 'Prescribed quantity');
        if (!given.error && given.quantity !== fill.prescribedQuantity) {
          throw new StockError('The prescribed quantity is already recorded');
        }
      }
      const already = fill?.dispensedQuantity || 0;
      if (quantity.quantity > prescribed - already) {
        throw new StockError('That quantity is more than the prescription still allows');
      }
      const batches = await availableBatches(medicine._id, session);
      let needed = quantity.quantity;
      const chosen = [];
      for (const batch of batches) {
        if (needed <= 0) break;
        const take = Math.min(batch.remainingQuantity, needed);
        chosen.push({ batch, take });
        needed -= take;
      }
      if (needed > 0) throw new StockError('There is not enough stock to dispense that quantity');

      const allocations = [];
      for (const chosenRow of chosen) {
        const updated = await takeFromBatch(chosenRow.batch._id, chosenRow.take, session);
        const movement = await writeMovement({
          requestId: `${requestId}:${chosenRow.batch._id}`,
          type: 'DISPENSING',
          direction: 'OUT',
          medicine: medicine._id,
          medicineName: line.medicineName,
          batch: chosenRow.batch._id,
          batchNumber: chosenRow.batch.batchNumber,
          quantity: chosenRow.take,
          balanceAfter: updated.remainingQuantity,
          reason: `Dispensed to ${patient.name}`,
          userId: user._id,
          userName: user.name,
          patient: patient._id,
          prescription: line._id,
          dispensing: record._id,
          fromLocation: chosenRow.batch.storageLocation,
        }, session);
        allocations.push({
          batch: chosenRow.batch._id,
          batchNumber: chosenRow.batch.batchNumber,
          expiryDate: chosenRow.batch.expiryDate,
          quantity: chosenRow.take,
          storageLocation: chosenRow.batch.storageLocation,
          movement: movement._id,
        });
      }
      const dispensedQuantity = already + quantity.quantity;
      if (!fill) {
        const [created] = await PrescriptionFill.create([{
          prescription: line._id,
          patient: patient._id,
          medicine: medicine._id,
          prescribedQuantity: prescribed,
          dispensedQuantity,
        }], withSession(session));
        fill = created;
      } else {
        fill.dispensedQuantity = dispensedQuantity;
        await fill.save(withSession(session));
      }
      record.prescribedQuantity = prescribed;
      record.dispensedQuantity = dispensedQuantity;
      record.quantity = quantity.quantity;
      record.fillStatus = dispensedQuantity >= prescribed ? 'COMPLETED' : 'PARTIAL';
      record.allocations = allocations;
      record.status = 'posted';
      await record.save(withSession(session));
      return record;
    });
    await rememberLowStock(medicine._id);
    return presentDispensing(saved);
  } catch (error) {
    await Dispensing.deleteOne({ _id: record._id, status: 'pending' });
    throw error;
  }
}

export async function stockByMedicine(filter = {}) {
  const rows = await Batch.aggregate([
    { $match: { remainingQuantity: { $gt: 0 }, ...filter } },
    {
      $group: {
        _id: '$medicine',
        onHand: { $sum: '$remainingQuantity' },
        nearestExpiry: { $min: '$expiryDate' },
        batches: { $sum: 1 },
        medicineName: { $first: '$medicineName' },
        strength: { $first: '$strength' },
        form: { $first: '$form' },
      },
    },
    { $sort: { medicineName: 1 } },
  ]);
  const medicines = await Medicine.find({ _id: { $in: rows.map((row) => row._id) } })
    .select('medicineCode minimumStock reorderLevel active');
  const byId = new Map(medicines.map((item) => [String(item._id), item]));
  return rows.map((row) => {
    const medicine = byId.get(String(row._id));
    const minimumStock = medicine?.minimumStock || medicine?.reorderLevel || 0;
    return {
      medicine: row._id,
      medicineCode: medicine?.medicineCode || '',
      medicineName: row.medicineName,
      strength: row.strength || '',
      form: row.form || '',
      onHand: row.onHand,
      minimumStock,
      low: minimumStock > 0 && row.onHand <= minimumStock,
      nearestExpiry: row.nearestExpiry,
      batches: row.batches,
      active: medicine ? medicine.active !== false : true,
    };
  });
}

export async function listBatches(query) {
  const filter = {};
  if (mongoose.isValidObjectId(query.medicine)) filter.medicine = query.medicine;
  if (query.batchNumber) filter.batchNumber = new RegExp(cleanText(query.batchNumber, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const window = cleanText(query.expiry, 20);
  const today = startOfToday();
  const soon = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (window === 'expired') filter.expiryDate = { $lt: today };
  if (window === 'near') filter.expiryDate = { $gte: today, $lte: soon };
  if (query.onHand === 'true') filter.remainingQuantity = { $gt: 0 };
  const records = await Batch.find(filter).sort({ expiryDate: 1, medicineName: 1 }).limit(200);
  return records.map(presentBatch);
}

export async function listAlerts() {
  const today = startOfToday();
  const soon = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const [stock, near, expired] = await Promise.all([
    stockByMedicine(),
    Batch.find({ remainingQuantity: { $gt: 0 }, expiryDate: { $gte: today, $lte: soon } }).sort({ expiryDate: 1 }).limit(50),
    Batch.find({ remainingQuantity: { $gt: 0 }, expiryDate: { $lt: today } }).sort({ expiryDate: 1 }).limit(50),
  ]);
  return {
    lowStock: stock.filter((row) => row.low),
    nearExpiry: near.map(presentBatch),
    expired: expired.map(presentBatch),
  };
}

export { presentBatch };
