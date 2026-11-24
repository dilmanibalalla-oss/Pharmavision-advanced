import express from 'express';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import patientsRouter from './routes/patients.js';
import medicinesRouter from './routes/medicines.js';
import dashboardRouter from './routes/dashboard.js';
import doctorsRouter from './routes/doctors.js';
import consultationsRouter from './routes/consultations.js';
import treatmentPlansRouter from './routes/treatmentPlans.js';
import suppliersRouter from './routes/suppliers.js';
import purchaseOrdersRouter from './routes/purchaseOrders.js';
import inventoryRouter from './routes/inventory.js';
import dispensingRouter from './routes/dispensing.js';
import shelvesRouter from './routes/shelves.js';
import scansRouter from './routes/scans.js';
import alertsRouter from './routes/alerts.js';
import reportsRouter from './routes/reports.js';
import auditRouter from './routes/audit.js';
import Patient from './models/Patient.js';
import Medicine from './models/Medicine.js';
import { connectDb } from './db.js';
import { requireAuth } from './middleware/auth.js';
import { allowedOrigin, rejectOperators, requestId, securityHeaders } from './middleware/security.js';

const app = express();
app.disable('x-powered-by');
app.set('query parser', 'simple');
const parseJson = express.json({ limit: '8mb' });

app.use(requestId);
app.use(securityHeaders);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin) return next();
  if (!allowedOrigin(origin)) return res.status(403).json({ message: 'This origin is not allowed' });
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Service-Token, X-Request-Id, X-Pharmavision-Client, X-Refresh-Token'
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});
app.use((req, res, next) => {
  if (typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body || '{}');
    } catch {
      req.body = {};
    }
    return rejectOperators(req, res, next);
  }
  if (req.body && typeof req.body === 'object') return rejectOperators(req, res, next);
  return parseJson(req, res, (error) => {
    if (error) return next(error);
    return rejectOperators(req, res, next);
  });
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
app.use('/api/consultations', consultationsRouter);
app.use('/api/treatment-plans', treatmentPlansRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/purchase-orders', purchaseOrdersRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/dispensing', dispensingRouter);
app.use('/api/shelves', shelvesRouter);
app.use('/api/scans', scansRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/audit', auditRouter);

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
