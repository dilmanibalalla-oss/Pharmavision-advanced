import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.JWT_SECRET = 'test-secret-value';
process.env.NODE_ENV = 'test';
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;

const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri('helio_pharmacy');

const { default: app } = await import('../src/app.js');
const { default: User } = await import('../src/models/User.js');
const { default: Batch } = await import('../src/models/Batch.js');
const { default: StockMovement } = await import('../src/models/StockMovement.js');

let server;
let base;
let adminCookie;
let pharmacistCookie;
let doctorCookie;
let inventoryCookie;

function cookieHeader(response) {
  const rows = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  return rows.map((row) => row.split(';')[0]).join('; ');
}

async function login(email) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct-password' }),
  });
  return cookieHeader(response);
}

async function send(path, { method = 'GET', cookie = adminCookie, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = response.headers.get('content-type') || '';
  const payload = type.includes('json') ? await response.json() : await response.text();
  return { status: response.status, body: payload };
}

function day(offset) {
  return new Date(Date.now() + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

describe('pharmacy supply', { concurrency: 1 }, () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const passwordHash = await bcrypt.hash('correct-password', 10);
    await User.create([
      { name: 'Clinic admin', email: 'admin@helio.local', passwordHash, role: 'ADMIN', active: true },
      { name: 'Pharma', email: 'pharmacy@helio.local', passwordHash, role: 'PHARMACIST', active: true },
      { name: 'Dr Lee', email: 'lee@helio.local', passwordHash, role: 'DOCTOR', active: true },
      { name: 'Stores', email: 'stores@helio.local', passwordHash, role: 'INVENTORY_MANAGER', active: true },
    ]);
    server = app.listen(0);
    base = `http://127.0.0.1:${server.address().port}`;
    adminCookie = await login('admin@helio.local');
    pharmacistCookie = await login('pharmacy@helio.local');
    doctorCookie = await login('lee@helio.local');
    inventoryCookie = await login('stores@helio.local');
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    delete globalThis.helioDb;
    await mongoose.disconnect();
    await mongo.stop();
  });

  test('catalog search, duplicates, and deactivation stay off the stock quantity', async () => {
    const created = await send('/api/medicines', {
      method: 'POST',
      body: {
        brandName: 'Amoxil',
        genericName: 'Amoxicillin',
        activeIngredient: 'Amoxicillin trihydrate',
        strength: '500 mg',
        form: 'Capsule',
        category: 'Antibiotic',
        manufacturer: 'Helio Labs',
        barcode: '1234567890123',
        description: 'Capsule for throat infection',
        storageInstructions: 'Keep below 25 C',
        prescriptionRequired: true,
        minimumStock: 20,
      },
    });
    assert.equal(created.status, 201);
    assert.match(created.body.medicineCode, /^MED-/);
    assert.equal(created.body.brandName, 'Amoxil');
    assert.equal(created.body.quantity, undefined);

    const duplicate = await send('/api/medicines', {
      method: 'POST',
      body: { name: 'amoxil', strength: '500 mg', form: 'Capsule' },
    });
    assert.equal(duplicate.status, 409);

    const barcode = await send('/api/medicines', {
      method: 'POST',
      body: { name: 'Other brand', strength: '250 mg', form: 'Capsule', barcode: '1234567890123' },
    });
    assert.equal(barcode.status, 409);

    const byGeneric = await send('/api/medicines?generic=amoxicillin&form=Capsule&category=Antibiotic');
    assert.equal(byGeneric.body.length, 1);
    const byBarcode = await send('/api/medicines?barcode=1234567890123');
    assert.equal(byBarcode.body[0]._id, created.body._id);

    const imported = await send('/api/medicines/import', {
      method: 'POST',
      body: {
        medicines: [
          { brandName: 'Amoxil', strength: '500 mg', form: 'Capsule' },
          { brandName: 'Para', genericName: 'Paracetamol', strength: '500 mg', form: 'Tablet', minimumStock: 5 },
        ],
      },
    });
    assert.equal(imported.status, 201);
    assert.equal(imported.body.created, 1);
    assert.equal(imported.body.skipped.length, 1);

    const exported = await send('/api/medicines/export');
    assert.equal(exported.status, 200);
    assert.match(exported.body, /Amoxil/);

    const closed = await send(`/api/medicines/${created.body._id}/active`, {
      method: 'PATCH',
      body: { active: false },
    });
    assert.equal(closed.status, 200);
    assert.equal(closed.body.active, false);
    const hidden = await send('/api/medicines?q=Amoxil');
    assert.equal(hidden.body.length, 0);
    const shown = await send('/api/medicines?q=Amoxil&active=all');
    assert.equal(shown.body.length, 1);
  });

  test('suppliers are validated and purchase receiving cannot be posted twice', async () => {
    const bad = await send('/api/suppliers', {
      method: 'POST',
      cookie: inventoryCookie,
      body: { name: 'City Wholesale', contactPerson: 'Nimal', email: 'not-an-email', address: '4 Lake Road' },
    });
    assert.equal(bad.status, 400);
    assert.match(bad.body.message, /email/i);

    const refused = await send('/api/suppliers', { cookie: doctorCookie });
    assert.equal(refused.status, 403);

    const supplier = await send('/api/suppliers', {
      method: 'POST',
      body: {
        name: 'City Wholesale',
        contactPerson: 'Nimal',
        phone: '0771234567',
        email: 'orders@city.example',
        address: '4 Lake Road',
        registration: 'REG-100',
        notes: 'Delivers on Tuesdays',
      },
    });
    assert.equal(supplier.status, 201);
    assert.match(supplier.body.supplierCode, /^SUP-/);

    const medicine = await send('/api/medicines', {
      method: 'POST',
      body: { name: 'Testcillin', genericName: 'Testcillin', strength: '250 mg', form: 'Capsule', minimumStock: 4 },
    });
    assert.equal(medicine.status, 201);

    const order = await send('/api/purchase-orders', {
      method: 'POST',
      body: {
        supplier: supplier.body._id,
        orderDate: day(0),
        expectedDelivery: day(7),
        items: [{ medicine: medicine.body._id, quantity: 10, unitCost: 12.5 }],
      },
    });
    assert.equal(order.status, 201);
    assert.equal(order.body.totalAmount, 125);
    assert.equal(order.body.status, 'ORDERED');

    const expired = await send(`/api/purchase-orders/${order.body._id}/receive`, {
      method: 'POST',
      body: {
        requestId: 'receipt-expired-01',
        batches: [{
          medicine: medicine.body._id,
          batchNumber: 'OLD',
          manufacturingDate: day(-40),
          expiryDate: day(-1),
          quantity: 10,
          storageLocation: 'Shelf A',
        }],
      },
    });
    assert.equal(expired.status, 400);
    assert.match(expired.body.message, /expired/i);
    assert.equal(await Batch.countDocuments({ batchNumber: 'OLD' }), 0);

    const receipt = {
      requestId: 'receipt-amox-0001',
      batches: [{
        medicine: medicine.body._id,
        batchNumber: 'B1',
        manufacturingDate: day(-20),
        expiryDate: day(20),
        quantity: 4,
        storageLocation: 'Shelf A',
      }, {
        medicine: medicine.body._id,
        batchNumber: 'B2',
        manufacturingDate: day(-10),
        expiryDate: day(90),
        quantity: 6,
        storageLocation: 'Shelf A',
      }],
    };
    const first = await send(`/api/purchase-orders/${order.body._id}/receive`, { method: 'POST', body: receipt });
    assert.equal(first.status, 201);
    assert.equal(first.body.status, 'RECEIVED');
    const second = await send(`/api/purchase-orders/${order.body._id}/receive`, { method: 'POST', body: receipt });
    assert.equal(second.status, 200);
    assert.equal(second.body.replay, true);
    assert.equal(await Batch.countDocuments({ medicine: medicine.body._id }), 2);
    const onHand = await Batch.aggregate([
      { $match: { medicine: new mongoose.Types.ObjectId(medicine.body._id) } },
      { $group: { _id: null, total: { $sum: '$remainingQuantity' } } },
    ]);
    assert.equal(onHand[0].total, 10);
    assert.equal(await StockMovement.countDocuments({ type: 'PURCHASE', medicine: medicine.body._id }), 2);

    const history = await send(`/api/suppliers/${supplier.body._id}/purchases`);
    assert.equal(history.body.purchases[0].orderCode, order.body.orderCode);

    const inactive = await send(`/api/suppliers/${supplier.body._id}/status`, {
      method: 'PATCH',
      body: { status: 'INACTIVE' },
    });
    assert.equal(inactive.body.status, 'INACTIVE');
    const found = await send('/api/suppliers?status=INACTIVE&q=City');
    assert.equal(found.body.total, 1);

    const stock = await send('/api/inventory/stock?q=Testcillin');
    assert.equal(stock.body.stock[0].onHand, 10);
    const alerts = await send('/api/inventory/alerts');
    assert.equal(alerts.body.lowStock.some((row) => row.medicineName === 'Testcillin'), false);
    const near = await send('/api/inventory/batches?expiry=near&onHand=true');
    assert.equal(near.body.batches.some((row) => row.batchNumber === 'B1'), true);

    const early = await Batch.findOne({ batchNumber: 'B1' });
    const damaged = await send('/api/inventory/movements', {
      method: 'POST',
      body: { requestId: 'damage-b1-0001', type: 'DAMAGED', batch: early._id, quantity: 1, reason: 'Broken blister' },
    });
    assert.equal(damaged.status, 201);
    const again = await send('/api/inventory/movements', {
      method: 'POST',
      body: { requestId: 'damage-b1-0001', type: 'DAMAGED', batch: early._id, quantity: 1, reason: 'Broken blister' },
    });
    assert.equal(again.status, 200);
    assert.equal(again.body.replay, true);
    const after = await Batch.findById(early._id);
    assert.equal(after.remainingQuantity, 3);

    const negative = await send('/api/inventory/movements', {
      method: 'POST',
      body: { requestId: 'adjust-too-much', type: 'AUTHORIZED_ADJUSTMENT', direction: 'OUT', batch: early._id, quantity: 9, reason: 'Count correction' },
    });
    assert.equal(negative.status, 400);
    assert.equal((await Batch.findById(early._id)).remainingQuantity, 3);

    const moved = await send('/api/inventory/movements', {
      method: 'POST',
      body: { requestId: 'transfer-b2-01', type: 'TRANSFER', batch: (await Batch.findOne({ batchNumber: 'B2' }))._id, quantity: 2, toLocation: 'Fridge', reason: 'Cold storage' },
    });
    assert.equal(moved.status, 201);
    assert.equal(await Batch.countDocuments({ batchNumber: 'B2' }), 2);
  });

  test('dispensing is partial, refuses insufficient stock, and ignores a repeated request', async () => {
    const medicine = await send('/api/medicines', {
      method: 'POST',
      body: { name: 'Painfree', genericName: 'Painfree', strength: '200 mg', form: 'Tablet' },
    });
    const supplier = await send('/api/suppliers', {
      method: 'POST',
      body: { name: 'North Stores', contactPerson: 'Ravi', email: 'north@example.com', address: '8 Hill Street' },
    });
    const order = await send('/api/purchase-orders', {
      method: 'POST',
      body: {
        supplier: supplier.body._id,
        orderDate: day(-1),
        items: [{ medicine: medicine.body._id, quantity: 5, unitCost: 2 }],
      },
    });
    const received = await send(`/api/purchase-orders/${order.body._id}/receive`, {
      method: 'POST',
      body: {
        requestId: 'receipt-ibu-0001',
        batches: [
          {
            medicine: medicine.body._id,
            batchNumber: 'EARLY',
            manufacturingDate: day(-30),
            expiryDate: day(15),
            quantity: 2,
            storageLocation: 'Bin 1',
          },
          {
            medicine: medicine.body._id,
            batchNumber: 'LATER',
            manufacturingDate: day(-30),
            expiryDate: day(120),
            quantity: 3,
            storageLocation: 'Bin 1',
          },
        ],
      },
    });
    assert.equal(received.status, 201, JSON.stringify(received.body));

    const patient = await send('/api/patients', {
      method: 'POST',
      body: { name: 'Kamal Silva', age: 28, address: '2 Temple Road' },
    });
    const chart = await send(`/api/patients/${patient.body._id}/treatments`, {
      method: 'POST',
      body: { medicineId: medicine.body._id, notes: 'After food', quantity: 6 },
    });
    const line = chart.body.visits.at(-1).treatments.at(-1);

    const short = await send('/api/dispensing', {
      method: 'POST',
      cookie: pharmacistCookie,
      body: { requestId: 'dispense-ibu-0001', patient: patient.body._id, prescription: line._id, quantity: 6 },
    });
    assert.equal(short.status, 400);
    assert.match(short.body.message, /not enough stock/i);
    const untouched = await Batch.aggregate([
      { $match: { medicine: new mongoose.Types.ObjectId(medicine.body._id) } },
      { $group: { _id: null, total: { $sum: '$remainingQuantity' } } },
    ]);
    assert.equal(untouched[0].total, 5);

    const partial = await send('/api/dispensing', {
      method: 'POST',
      cookie: pharmacistCookie,
      body: { requestId: 'dispense-ibu-0002', patient: patient.body._id, prescription: line._id, quantity: 3 },
    });
    assert.equal(partial.status, 201);
    assert.equal(partial.body.status, 'PARTIAL');
    assert.equal(partial.body.dispensedQuantity, 3);
    assert.equal(partial.body.remainingQuantity, 3);
    assert.equal(partial.body.pharmacistName, 'Pharma');
    assert.deepEqual(partial.body.allocations.map((item) => item.batchNumber), ['EARLY', 'LATER']);
    assert.equal(partial.body.allocations[0].quantity, 2);
    assert.equal(partial.body.allocations[1].quantity, 1);

    const repeat = await send('/api/dispensing', {
      method: 'POST',
      cookie: pharmacistCookie,
      body: { requestId: 'dispense-ibu-0002', patient: patient.body._id, prescription: line._id, quantity: 3 },
    });
    assert.equal(repeat.status, 200);
    assert.equal(repeat.body.replay, true);
    assert.equal(repeat.body._id, partial.body._id);
    const once = await Batch.aggregate([
      { $match: { medicine: new mongoose.Types.ObjectId(medicine.body._id) } },
      { $group: { _id: null, total: { $sum: '$remainingQuantity' } } },
    ]);
    assert.equal(once[0].total, 2);

    const rest = await send('/api/dispensing', {
      method: 'POST',
      cookie: pharmacistCookie,
      body: { requestId: 'dispense-ibu-0003', patient: patient.body._id, prescription: line._id, quantity: 2 },
    });
    assert.equal(rest.status, 201);
    assert.equal(rest.body.status, 'PARTIAL');
    assert.equal(rest.body.dispensedQuantity, 5);
    assert.equal(rest.body.allocations[0].batchNumber, 'LATER');

    const blocked = await send('/api/dispensing', { cookie: doctorCookie });
    assert.equal(blocked.status, 403);
    const queue = await send(`/api/dispensing/prescriptions?q=${patient.body.patientCode}`, { cookie: pharmacistCookie });
    assert.equal(queue.body.prescriptions[0].status, 'PARTIAL');
    const history = await send(`/api/dispensing/history?prescription=${line._id}`, { cookie: pharmacistCookie });
    assert.equal(history.body.dispensings.length, 2);
  });
});
