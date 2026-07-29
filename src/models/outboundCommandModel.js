import mongoose from 'mongoose';

const outboundCommandSchema = new mongoose.Schema({
  commandId:   { type: String, required: true, unique: true, index: true },
  provider:    { type: String, required: true, enum: ['gcash', 'maya', 'bank', 'maribank'] },
  account:     { type: String, required: true },   // destination phone/account
  amount:      { type: Number, required: true },
  referenceId: { type: String, required: true },    // WD-xxx
  status: {
    type: String,
    enum: ['PENDING', 'EXECUTING', 'COMPLETED', 'FAILED'],
    default: 'PENDING',
    index: true,
  },
  deviceId:    { type: String, default: null },
  txHash:      { type: String, default: null },
  resultData:  { type: Object, default: {} },
}, { timestamps: true });

export default mongoose.model('OutboundCommand', outboundCommandSchema);
