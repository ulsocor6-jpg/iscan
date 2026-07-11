import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema({
  type: String,
  entityId: String,
  userId: String,
  data: Object,
  timestamp: { type: Date, default: Date.now },
  // Auto-cleanup: set at write time based on event type (see emit()).
  // A single TTL index on this field handles expiry — no manual
  // deletion or cron job needed.
  expiresAt: { type: Date, index: { expireAfterSeconds: 0 } },
});
const Event = mongoose.model('Event', eventSchema);

// Only these event types get persisted to MongoDB's audit trail.
// Everything else (routine http_request logging, dashboard polling, etc.)
// still broadcasts live via SSE but is never written to disk — that's
// what was flooding the collection (347k+ docs from http_request alone).
const PERSIST_PATTERN = /(deposit|withdrawal)\.|error|failed|flagged/i;

const ERROR_RETENTION_DAYS     = 7;
const FINANCIAL_RETENTION_DAYS = 90;

function computeExpiresAt(type) {
  const isErrorLike = /error|failed|flagged/i.test(type);
  const days = isErrorLike ? ERROR_RETENTION_DAYS : FINANCIAL_RETENTION_DAYS;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

// In-memory SSE admin clients
const adminClients = new Set();

class EventStreamService {

  // Register an admin SSE connection
  addAdminClient(res) {
    adminClients.add(res);
    console.log(`[SSE] Admin client connected. Total: ${adminClients.size}`);
    res.on('close', () => {
      adminClients.delete(res);
      console.log(`[SSE] Admin client disconnected. Total: ${adminClients.size}`);
    });
  }

  // Broadcast to all connected admin dashboards
  broadcast(type, data) {
    const payload = `data: ${JSON.stringify({ type, data, timestamp: new Date() })}\n\n`;
    for (const client of adminClients) {
      try {
        client.write(payload);
      } catch (err) {
        adminClients.delete(client);
      }
    }
  }

  async emit(type, data) {
    // Push to all connected admin dashboards instantly — always, regardless
    // of whether this event type gets persisted below.
    this.broadcast(type, data);

    // Only persist deposit/withdrawal/error-type events to the DB. This is
    // what actually caps collection growth — routine events (http_request,
    // admin GETs, etc.) are still visible live via SSE but never written.
    if (!PERSIST_PATTERN.test(type)) {
      return null;
    }

    const event = await Event.create({
      type,
      entityId: data.entityId || null,
      userId: data.userId || null,
      data,
      expiresAt: computeExpiresAt(type),
    });

    return event;
  }

  async getUserEvents(userId) {
    return await Event.find({ userId }).sort({ timestamp: -1 });
  }

  async getTransactionEvents(entityId) {
    return await Event.find({ entityId }).sort({ timestamp: -1 });
  }

  async getRecentAdminEvents(limit = 50) {
    return await Event.find({
      type: { $in: ['deposit.credited', 'deposit.flagged', 'withdrawal.processed'] }
    }).sort({ timestamp: -1 }).limit(limit).lean();
  }

  /**
   * General-purpose query for the System Inspector page.
   * @param {object} opts
   * @param {string} [opts.type] - exact type match, or a prefix ending in "*" e.g. "admin.*"
   * @param {string} [opts.userId]
   * @param {number} [opts.limit=100]
   * @param {string|Date} [opts.before] - only events strictly before this timestamp (for pagination)
   */
  async getEvents({ type, userId, limit = 100, before } = {}) {
    const filter = {};
    if (type) {
      if (type.endsWith('*')) {
        filter.type = { $regex: '^' + type.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') };
      } else {
        filter.type = type;
      }
    }
    if (userId) filter.userId = userId;
    if (before) filter.timestamp = { $lt: new Date(before) };

    return await Event.find(filter)
      .sort({ timestamp: -1 })
      .limit(Math.min(limit, 500))
      .lean();
  }
}

export default new EventStreamService();
