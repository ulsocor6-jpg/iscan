import mongoose from "mongoose";

const schema = new mongoose.Schema({

  source: {
    type: String,
    required: true,
    index: true
  },

  eventId: {
    type: String,
    required: true
  },

  eventHash: {
    type: String,
    required: true
  },

  status: {
    type: String,
    enum: ["RECEIVED","PROCESSING","PROCESSED","FAILED","IGNORED"],
    default: "RECEIVED",
    index: true
  },

  receivedAt: {
    type: Date,
    default: Date.now
  },

  processingStartedAt: Date,

  processedAt: Date,

  failureReason: String,

  metadata: {
    type: Object,
    default: {}
  }

});

schema.index(
  {
    source: 1,
    eventId: 1
  },
  {
    unique: true
  }
);

schema.index({
  processedAt: 1
});

export default mongoose.model(
  "IngressEvent",
  schema
);
