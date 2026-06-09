import mongoose from 'mongoose';

const webhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      unique: true,
      index: true,
      required: true
    },

    provider: {
      type: String,
      enum: ['maya', 'coinsph', 'bank', 'internal'],
      required: true
    },

    type: {
      type: String,
      index: true
    },

    referenceId: {
      type: String,
      index: true
    },

    payload: {
      type: Object,
      default: {}
    },

    processed: {
      type: Boolean,
      default: false,
      index: true
    },

    processedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

export default mongoose.model('WebhookEvent', webhookEventSchema);
