import { Router } from 'express';
import { canonicalRole } from '../access.js';
import { csvDocument, simplePdf } from '../documents.js';
import { requireAuth } from '../middleware/auth.js';
import { REPORTS, buildReport, reportFor } from '../reports.js';

const router = Router();
router.use(requireAuth);

function windowFor(query) {
  const from = query.from ? new Date(`${query.from}T00:00:00.000Z`) : new Date(Date.now() - 30 * 86400000);
  const to = query.to ? new Date(`${query.to}T23:59:59.999Z`) : new Date();
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return { error: 'Choose a valid date range' };
  }
  if (to - from > 5 * 366 * 86400000) return { error: 'Choose a range of five years or less' };
  return { from, to };
}

function guard(req, res, next) {
  const report = reportFor(req.params.key);
  if (!report) return res.status(404).json({ message: 'That report is not available' });
  if (!report.roles.includes(canonicalRole(req.user.role))) {
    return res.status(403).json({ message: 'You do not have access to that' });
  }
  req.report = report;
  return next();
}

router.get('/', (req, res) => {
  const role = canonicalRole(req.user.role);
  res.json({
    reports: REPORTS.filter((item) => item.roles.includes(role)).map(({ key, title, group }) => ({ key, title, group })),
  });
});

router.get('/:key/export', guard, async (req, res) => {
  const dates = windowFor(req.query);
  if (dates.error) return res.status(400).json({ message: dates.error });
  const format = String(req.query.format || 'csv').toLowerCase();
  if (format !== 'csv' && format !== 'pdf') return res.status(400).json({ message: 'Export a CSV or PDF file' });
  const report = await buildReport(req.params.key, {
    ...dates,
    q: req.query.q,
    sort: req.query.sort,
    dir: req.query.dir === 'asc' ? 'asc' : 'desc',
    page: 1,
    limit: 1000,
  });
  const filename = `${req.params.key}-report`;
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    return res.send(csvDocument(report.columns, report.rows));
  }
  const lines = [
    ...Object.entries(report.summary).filter(([, value]) => typeof value === 'number').map(([key, value]) => `${key}: ${value}`),
    ...report.rows.map((row) => report.columns.map((column) => row[column.key]).join(' | ')),
  ];
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
  return res.send(simplePdf(req.report.title, lines));
});

router.get('/:key', guard, async (req, res) => {
  const dates = windowFor(req.query);
  if (dates.error) return res.status(400).json({ message: dates.error });
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const report = await buildReport(req.params.key, {
    ...dates,
    q: req.query.q,
    sort: req.query.sort,
    dir: req.query.dir === 'asc' ? 'asc' : 'desc',
    page,
    limit,
  });
  res.json({ key: req.params.key, title: req.report.title, ...report });
});

export default router;
