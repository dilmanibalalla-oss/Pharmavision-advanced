import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import patientsRouter from './routes/patients.js';
import medicinesRouter from './routes/medicines.js';
import dashboardRouter from './routes/dashboard.js';
import doctorsRouter from './routes/doctors.js';
import Patient from './models/Patient.js';
import Medicine from './models/Medicine.js';
import { connectDb } from './db.js';
import { requireAuth } from './middleware/auth.js';

const app = express();
const parseJson = express.json({ limit: '1mb' });

app.use(cors({ origin: true, credentials: true }));
app.use((req, res, next) => {
  if (typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body || '{}');
    } catch {
      req.body = {};
    }
    return next();
  }
  if (req.body && typeof req.body === 'object') return next();
  return parseJson(req, res, next);
});

app.use(async (_req, _res, next) => {
  try {
    await connectDb();
    next();
  } catch (error) {
    next(error);
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, database: 'connected' });
});

app.get('/api/stats', requireAuth, async (_req, res) => {
  const [patients, medicines, visits] = await Promise.all([
    Patient.countDocuments(),
    Medicine.countDocuments(),
    Patient.aggregate([{ $group: { _id: null, total: { $sum: '$visitCount' } } }]),
  ]);
  res.json({
    patients,
    medicines,
    visits: visits[0]?.total || 0,
  });
});

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/patients', patientsRouter);
app.use('/api/medicines', medicinesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/doctors', doctorsRouter);

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error.code === 'NO_URI') {
    return res.status(500).json({ message: 'The clinic database is not configured' });
  }
  if (error.code === 'NO_SECRET') {
    return res.status(500).json({ message: 'Sign-in is not configured' });
  }
  if (error.name === 'ValidationError') {
    return res.status(400).json({ message: 'Check those details and try again' });
  }
  res.status(500).json({ message: 'The clinic server could not finish that request' });
});

export default app;
