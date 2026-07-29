import User from '../models/userModel.js';
import { addAuditLog } from './auditService.js';

const VALID_TRANSITIONS = {
    ACTIVE:      ['SUSPENDED', 'RESTRICTED', 'DEACTIVATED', 'CLOSED'],
    SUSPENDED:   ['ACTIVE', 'DEACTIVATED', 'CLOSED'],
    RESTRICTED:  ['ACTIVE', 'CLOSED'],
    DEACTIVATED: ['ACTIVE'],
    CLOSED:      [],
};

async function transitionAccount(userId, targetStatus, reason) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    const current = user.accountStatus || 'ACTIVE';

    if (!VALID_TRANSITIONS[current]?.includes(targetStatus)) {
        throw new Error(`Cannot transition from ${current} to ${targetStatus}`);
    }

    user.accountStatus = targetStatus;
    await user.save();

    if (addAuditLog) {
        await addAuditLog(userId, 'ACCOUNT_LIFECYCLE', { from: current, to: targetStatus, reason });
    }

    return user;
}

export const deactivateUser = (userId, reason) => transitionAccount(userId, 'DEACTIVATED', reason);
export const reactivateUser = (userId, reason) => transitionAccount(userId, 'ACTIVE', reason);
export const suspendUser   = (userId, reason) => transitionAccount(userId, 'SUSPENDED', reason);
export const restrictUser  = (userId, reason) => transitionAccount(userId, 'RESTRICTED', reason);
export const closeUser     = (userId, reason) => transitionAccount(userId, 'CLOSED', reason);
export { transitionAccount };
