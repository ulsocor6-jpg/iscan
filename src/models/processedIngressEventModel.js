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

  processedAt: {
    type: Date,
    default: Date.now
  },

  metadata: {
    type: Object,
    default: {}
  }
});

schema.index(
  {
    source:1,
    eventId:1
  },
  {
    unique:true
  }
);

export default mongoose.model(
  "ProcessedIngressEvent",
  schema
);
