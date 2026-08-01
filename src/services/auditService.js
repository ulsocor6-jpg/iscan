import Audit from '../models/auditModel.js';

export async function addAuditLog(userId, action, details = {}, { entity, entityId, status = 'success' } = {}) {
    await Audit.create({ userId, action, details, entity, entityId, status });
}
