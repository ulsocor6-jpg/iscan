import allocationEngine from '../treasury/allocationEngine.js';
import eventStreamService from '../eventStreamService.js';
import { sendTelegramAlert } from '../telegramAlertService.js';
import MayaProvider from '../../integrations/paymentProviders/mayaProvider.js';
import treasuryCoordinator from '../treasury/treasuryCoordinator.js';
import OutboundCommand from '../../models/outboundCommandModel.js';
import crypto from 'crypto';

class PhpExecutionDispatcher {
  async dispatch({ userId, referenceId, amount, netAmount, channel, destination, reservationId, treasuryAccountId }) {
    console.log(`[ExecutionDispatcher] Dispatching ${channel} withdrawal ${referenceId} for ₱${netAmount} to ${destination}`);

    try {
      switch (channel) {
        case 'MAYA':
          await this._sendMaya({ netAmount, destination, referenceId, userId });
          break;

        case 'GCASH':
          await this._sendGcash({ netAmount, destination, referenceId, userId });
          break;

        case 'BANK':
          await this._sendBank({ netAmount, destination, referenceId, userId });
          break;

        case 'MARIBANK':
          await this._sendMaribank({ netAmount, destination, referenceId, userId });
          break;

        default:
          throw new Error(`Unsupported PHP channel: ${channel}`);
      }

      // Mark reservation as consumed (money sent)
      await allocationEngine.consume(reservationId);

      eventStreamService.emit('withdrawal.completed', {
        entityId: referenceId,
        userId,
        amount,
        netAmount,
        channel,
        status: 'completed',
        message: `PHP Withdrawal sent – ₱${netAmount.toFixed(2)} to ${channel} ${destination}`,
      });

      return { success: true, status: 'completed' };

    } catch (err) {
      console.error(`[ExecutionDispatcher] Failed to dispatch ${referenceId}:`, err.message);

      // Release the treasury reservation so funds aren't locked forever
      try {
        await allocationEngine.release(reservationId);
      } catch (releaseErr) {
        console.error(`[ExecutionDispatcher] Failed to release reservation ${reservationId}:`, releaseErr.message);
      }

      eventStreamService.emit('withdrawal.failed', {
        entityId: referenceId,
        userId,
        amount,
        channel,
        error: err.message,
        message: `PHP Withdrawal failed – ₱${netAmount.toFixed(2)} not sent. Funds are still debited; manual refund required.`,
      });

      await sendTelegramAlert(
        `🚨 PHP Withdrawal FAILED\n` +
        `Ref: ${referenceId}\n` +
        `Channel: ${channel}\n` +
        `Amount: ₱${netAmount}\n` +
        `Error: ${err.message}`
      );

      throw err;
    }
  }

  /* ------------------------------------------------------------------
     MAYA
     ------------------------------------------------------------------ */
  async _sendMaya({ netAmount, destination, referenceId, userId }) {
    const result = await MayaProvider.sendMoney({
      amount: netAmount,
      account: destination,
      referenceId,
    });

    if (!result.success) {
      throw new Error(`Maya send failed: ${result.error || 'Unknown error'}`);
    }

    console.log(`[ExecutionDispatcher] ✅ Maya transfer completed – ref: ${result.referenceId}`);

    // Deduct sent amount from the treasury account
    try {
      const accounts = await treasuryCoordinator.getLiveState('PHP');
      const target = accounts.find(a => a.provider === 'maya' && a.isActive);
      if (target) {
        await treasuryCoordinator.updatePhysicalBalance(
          target.id,
          Math.max(0, target.physicalBalance - netAmount),
          'withdrawal'
        );
      }
    } catch (syncErr) {
      console.error('[ExecutionDispatcher] Treasury sync error:', syncErr.message);
    }
  }

  /* ------------------------------------------------------------------
     GCASH
     ------------------------------------------------------------------ */
  async _sendGcash({ netAmount, destination, referenceId, userId }) {
    const commandId = `CMD-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    await OutboundCommand.create({
      commandId,
      provider: 'gcash',
      account: destination,
      amount: netAmount,
      referenceId,
      status: 'PENDING',
    });
    console.log(`[ExecutionDispatcher] GCash command enqueued – ${commandId}`);
  }

  /* ------------------------------------------------------------------
     BANK
     ------------------------------------------------------------------ */
  async _sendBank({ netAmount, destination, referenceId, userId }) {
    const commandId = `CMD-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    await OutboundCommand.create({
      commandId,
      provider: 'bank',
      account: destination,
      amount: netAmount,
      referenceId,
      status: 'PENDING',
    });
    console.log(`[ExecutionDispatcher] Bank command enqueued – ${commandId}`);
  }

  /* ------------------------------------------------------------------
     MARIBANK
     ------------------------------------------------------------------ */
  async _sendMaribank({ netAmount, destination, referenceId, userId }) {
    const commandId = `CMD-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    await OutboundCommand.create({
      commandId,
      provider: 'maribank',
      account: destination,
      amount: netAmount,
      referenceId,
      status: 'PENDING',
    });
    console.log(`[ExecutionDispatcher] MariBank command enqueued – ${commandId}`);
  }
}

export default new PhpExecutionDispatcher();
