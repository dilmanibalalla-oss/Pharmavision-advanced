import mongoose from 'mongoose';
import { seedMedicines } from './seed.js';
import { seedAdmin } from './seedAdmin.js';
import { assignPatientCodes } from './assignPatientCodes.js';

const cache = globalThis;

export function connectDb() {
  if (!process.env.MONGODB_URI) {
    const error = new Error('Missing MONGODB_URI');
    error.code = 'NO_URI';
    return Promise.reject(error);
  }

  if (!cache.helioDb) {
    const pending = mongoose
      .connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 })
      .then(async (connection) => {
        await seedMedicines();
        await seedAdmin();
        await assignPatientCodes();
        return connection;
      });
    cache.helioDb = pending;
    pending.catch(() => {
      if (cache.helioDb === pending) cache.helioDb = null;
    });
  }

  return cache.helioDb;
}
