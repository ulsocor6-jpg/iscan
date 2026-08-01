import mongoose from 'mongoose';

const treasuryAccountSchema = new mongoose.Schema({
  currency: {
    type: String,
    required: true,
    index: true,
  },
  provider: {
    type: String,
    required: true,
    enum: ['maya', 'gcash', 'bank_bpi', 'maribank', 'mexc'],
  },
  accountLabel: {
    type: String,
    required: true,
  },
  physicalBalance: {
    type: Number,
    required: true,
    default: 0,
  },
  reserved: {
    type: Number,
    required: true,
    default: 0,
  },
  pendingIncoming: {
    type: Number,
    required: true,
    default: 0,
  },
  pendingOutgoing: {
    type: Number,
    required: true,
    default: 0,
  },
  safetyReserve: {
    type: Number,
    required: true,
    default: 0,
  },
  isActive: {
    type: Boolean,
    required: true,
    default: true,
  },
  lastUpdatedBy: {
    type: String,
    default: null,
  },
}, { timestamps: true });

export default mongoose.model('TreasuryAccount', treasuryAccountSchema);
