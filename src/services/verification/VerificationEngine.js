// src/services/verification/VerificationEngine.js
import PendingOperation from '../../models/blockchain/pendingOperationModel.js';
import deduplicationService from '../../services/ingestion/deduplicationService.js';
import crypto from 'crypto';

class VerificationEngine {
  async verify(event, options = {}) {
    const results = [];

    // 1. Signature verification
    if (event.signature && event.timestamp) {
      const sigResult = await this.verifySignature(event);
      results.push(sigResult);
      if (!sigResult.passed) return this.fail('Signature verification failed', results);
    }

    // 2. Amount verification
    if (event.amount !== undefined) {
      const amountResult = this.verifyAmount(event);
      results.push(amountResult);
      if (!amountResult.passed) return this.fail('Amount verification failed', results);
    }

    // 3. Address verification
    if (event.address) {
      const addrResult = await this.verifyAddress(event);
      results.push(addrResult);
      if (!addrResult.passed) return this.fail('Address verification failed', results);
    }

    // 4. Reference / duplicate verification
    if (event.reference) {
      const refResult = await this.verifyReference(event);
      results.push(refResult);
      if (!refResult.passed) return this.fail('Duplicate reference', results);
    }

    // 5. Pending operation matching
    if (event.operationId) {
      const opResult = await this.verifyPendingOperation(event);
      results.push(opResult);
      if (!opResult.passed) return this.fail('Pending operation mismatch', results);
    }

    // 6. Expiration check
    if (options.pendingOperation || event.operationId) {
      const expResult = await this.verifyExpiration(event, options);
      results.push(expResult);
      if (!expResult.passed) return this.fail('Expired operation', results);
    }

    return this.pass(results);
  }

  async verifySignature(event) {
    let secret = null;

    // If operationId is provided, fetch its specific secret
    if (event.operationId) {
      const op = await PendingOperation.findOne({ operationId: event.operationId }).select('+depositSecret');
      if (op) secret = op.depositSecret;
    }

    // Fallback to global secret if no operation secret found
    if (!secret) {
      secret = process.env.ANDROID_PHP_SECRET;
      if (!secret) {
        return { passed: false, reason: 'No secret available' };
      }
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - event.timestamp) > 300) {
      return { passed: false, reason: 'Timestamp is too old (replay attack)' };
    }

    const dataString = `${event.userId}|${event.title || ''}|${event.text || ''}|${event.timestamp}`;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(dataString)
      .digest('hex');

    try {
      const isValid = crypto.timingSafeEqual(
        Buffer.from(event.signature, 'hex'),
        Buffer.from(expected, 'hex')
      );
      return { passed: isValid, reason: isValid ? 'Valid signature' : 'Invalid signature' };
    } catch {
      return { passed: false, reason: 'Signature verification error' };
    }
  }

  verifyAmount(event) {
    const amount = parseFloat(event.amount);
    if (isNaN(amount) || amount <= 0) {
      return { passed: false, reason: 'Invalid amount (must be > 0)' };
    }
    const MAX_DEPOSIT = process.env.MAX_DEPOSIT || 1000000;
    if (amount > MAX_DEPOSIT) {
      return { passed: false, reason: `Amount exceeds max limit (${MAX_DEPOSIT})` };
    }
    return { passed: true, reason: 'Amount is valid' };
  }

  async verifyAddress(event) {
    const { address, chain } = event;
    if (!address) return { passed: false, reason: 'Missing address' };
    if (chain && chain.toLowerCase() === 'eth') {
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return { passed: false, reason: 'Invalid Ethereum address format' };
      }
    }
    return { passed: true, reason: 'Address is valid' };
  }

  async verifyReference(event) {
    const { source, reference } = event;
    if (!reference) return { passed: true, reason: 'No reference to check' };
    const eventId = deduplicationService.createHash({ source, reference });
    const existing = await deduplicationService.getEvent(source, eventId);
    if (existing) {
      return { passed: false, reason: 'Duplicate reference (already processed)' };
    }
    return { passed: true, reason: 'Reference is unique' };
  }

  async verifyPendingOperation(event) {
    const { operationId, userId, amount, asset } = event;
    const pending = await PendingOperation.findOne({ operationId, status: 'PENDING' });
    if (!pending) {
      return { passed: false, reason: `No pending operation found for ID: ${operationId}` };
    }
    const tolerance = pending.tolerance || 0.01;
    const expected = parseFloat(pending.expectedAmount);
    const received = parseFloat(amount);
    const diff = Math.abs(expected - received);
    const pctDiff = expected > 0 ? diff / expected : Infinity;
    if (pctDiff > tolerance) {
      return {
        passed: false,
        reason: `Amount mismatch: expected ${expected}, received ${received} (tolerance ${tolerance * 100}%)`,
      };
    }
    if (pending.asset && pending.asset !== asset) {
      return { passed: false, reason: `Asset mismatch: expected ${pending.asset}, got ${asset}` };
    }
    if (pending.userId && pending.userId !== userId) {
      return { passed: false, reason: 'User does not match the pending operation' };
    }
    return {
      passed: true,
      reason: 'Pending operation matched',
      details: { pending },
    };
  }

  async verifyExpiration(event, options) {
    const pending = options.pendingOperation ||
      (event.operationId ? await PendingOperation.findOne({ operationId: event.operationId }) : null);
    if (!pending) return { passed: true, reason: 'No pending operation to check expiration' };
    if (!pending.expiration) return { passed: true, reason: 'No expiration set' };
    const now = new Date();
    if (now > pending.expiration) {
      return { passed: false, reason: `Operation expired at ${pending.expiration}` };
    }
    return { passed: true, reason: 'Operation is still valid' };
  }

  fail(reason, results) {
    return { passed: false, reason, results };
  }

  pass(results) {
    return { passed: true, reason: 'All verification checks passed', results };
  }
}

export default new VerificationEngine();
