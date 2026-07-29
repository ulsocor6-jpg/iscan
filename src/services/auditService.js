import Audit from '../models/auditModel.js';
export async function addAuditLog(userId, action, details = {}) {
    await Audit.create({ userId, action, details, timestamp: new Date() });
}
