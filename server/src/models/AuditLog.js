import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    userName: { type: String, default: '' },
    role: { type: String, default: '' },
    action: { type: String, required: true },
    entityType: { type: String, default: '' },
    entityId: { type: String, default: '' },
    requestId: { type: String, default: '' },
    summary: { type: String, default: '' },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ user: 1, createdAt: -1 });

export function presentAudit(record) {
  return {
    _id: record._id,
    user: record.user || null,
    userName: record.userName || '',
    role: record.role || '',
    action: record.action,
    entityType: record.entityType || '',
    entityId: record.entityId || '',
    requestId: record.requestId || '',
    summary: record.summary || '',
    createdAt: record.createdAt,
  };
}

export default mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
