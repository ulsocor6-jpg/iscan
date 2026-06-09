import mongoose from 'mongoose';

/**
 * EVENT STORE (FULL FINTECH AUDIT TRAIL)
 */
const eventSchema = new mongoose.Schema({
  type: String,
  entityId: String,

  userId: String,

  data: Object,

  timestamp: {
    type: Date,
    default: Date.now
  }
});

const Event = mongoose.model('Event', eventSchema);

class EventStreamService {

  async emit(type, data) {
    return await Event.create({
      type,
      entityId: data.entityId || null,
      userId: data.userId || null,
      data
    });
  }

  async getUserEvents(userId) {
    return await Event.find({ userId }).sort({ timestamp: -1 });
  }

  async getTransactionEvents(entityId) {
    return await Event.find({ entityId }).sort({ timestamp: -1 });
  }
}

export default new EventStreamService();
