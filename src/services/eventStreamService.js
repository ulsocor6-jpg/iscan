import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema({
  type: String,
  entityId: String,
  userId: String,
  data: Object,
  timestamp: { type: Date, default: Date.now }
});
const Event = mongoose.model('Event', eventSchema);

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
    // Save to MongoDB audit trail
    const event = await Event.create({
      type,
      entityId: data.entityId || null,
      userId: data.userId || null,
      data
    });

    // Push to all connected admin dashboards instantly
    this.broadcast(type, data);

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
}

export default new EventStreamService();
