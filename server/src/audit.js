import AuditLog from './models/AuditLog.js';
import { cleanText } from './validate.js';

const SENSITIVE = /password|token|authorization|cookie|secret/i;

export async function recordAudit(req, { action, entityType = '', entityId = '', summary = '' }) {
  const text = cleanText(summary, 240);
  if (!action || SENSITIVE.test(text) || SENSITIVE.test(String(action))) return;
  const record = {
    user: req.user?._id || null,
    userName: cleanText(req.user?.name, 120),
    role: cleanText(req.user?.role, 40),
    action: cleanText(action, 60),
    entityType: cleanText(entityType, 40),
    entityId: cleanText(entityId, 40),
    requestId: cleanText(req.requestId, 80),
    summary: text,
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await AuditLog.create(record);
      return;
    } catch (error) {
      if (attempt === 1) console.error('Audit record was not stored', error?.message || '');
    }
  }
}
