import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import PendingOperation from '../../models/blockchain/pendingOperationModel.js';

class OperationCreationService {
  async createPendingOperation({
    userId,
    operationType = 'DEPOSIT',
    asset,
    provider,
    network,
    expectedAmount,
    tolerance = 0.01,
    expirationMinutes = 60,
    metadata = {},
  }) {
    const operationId = `OP-${Date.now()}-${uuidv4().slice(0, 8)}`;
    const requestId = uuidv4();
    const correlationKey = `${userId}:${operationType}:${asset}:${Date.now()}`;
    const depositSecret = crypto.randomBytes(32).toString('hex');

    const pending = new PendingOperation({
      operationId,
      requestId,
      correlationKey,
      userId,
      operationType,
      asset,
      provider,
      network,
      expectedAmount,
      tolerance,
      expiration: new Date(Date.now() + expirationMinutes * 60 * 1000),
      depositSecret,
      status: 'PENDING',
      metadata,
    });

    await pending.save();
    return { pending, depositSecret };
  }

  async getDepositSecret(operationId) {
    const op = await PendingOperation.findOne({ operationId }).select('+depositSecret');
    return op ? op.depositSecret : null;
  }
}

export default new OperationCreationService();
