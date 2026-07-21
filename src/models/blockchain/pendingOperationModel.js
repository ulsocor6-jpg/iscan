import mongoose from 'mongoose';

const PendingOperationSchema = new mongoose.Schema(
  {
    operationId: { type: String, required: true, unique: true },
    requestId: { type: String, required: true },
    correlationKey: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    operationType: { type: String, enum: ['DEPOSIT', 'WITHDRAWAL', 'SWAP'], required: true },
    asset: { type: String, required: true },
    provider: { type: String },
    network: { type: String },
    expectedAmount: { type: Number, required: true },
    tolerance: { type: Number, default: 0.01 },
    expiration: { type: Date, required: true },
    depositSecret: { type: String, select: false },
    status: { type: String, enum: ['PENDING', 'COMPLETED', 'FAILED', 'EXPIRED'], default: 'PENDING' },
    failureReason: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

PendingOperationSchema.index({ operationId: 1 });
PendingOperationSchema.index({ userId: 1, status: 1 });
PendingOperationSchema.index({ userId: 1, provider: 1, status: 1 });

export default mongoose.model('PendingOperation', PendingOperationSchema);
