import crypto from 'crypto';
import WebhookEvent from '../models/webhookEventModel.js';
import transactionService from './transactionService.js';

class WebhookService {

  /**
   * ID EMPOTENT WEBHOOK PROCESSOR
   */
  async processWebhook({ provider, payload }) {

    const eventId = payload.eventId || crypto.randomUUID();

    // 1. CHECK DUPLICATE EVENT
    const existing = await WebhookEvent.findOne({ eventId });

    if (existing?.processed) {
      return { skipped: true, reason: 'duplicate_event' };
    }

    const event = await WebhookEvent.create({
      eventId,
      provider,
      type: payload.event,
      referenceId: payload.referenceId,
      payload
    });

    try {

      // 2. ROUTE EVENT
      if (payload.status === 'success') {
        await transactionService.markSettledByReference(payload.referenceId);
      }

      if (payload.status === 'failed') {
        await transactionService.markFailedByReference(payload.referenceId);
      }

      // 3. MARK PROCESSED
      event.processed = true;
      event.processedAt = new Date();
      await event.save();

      return { success: true };

    } catch (err) {
      throw err;
    }
  }
}

export default new WebhookService();
