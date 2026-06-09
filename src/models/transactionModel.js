import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    /**
     * CORE ACTOR FIELDS
     */
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },

    senderAddress: {
      type: String,
      required: true,
      index: true
    },

    receiverAddress: {
      type: String,
      required: true,
      index: true
    },

    receiverEmail: {
      type: String,
      default: null
    },

    /**
     * MONEY CORE
     */
    amount: {
      type: Number,
      required: true,
      min: 0.0001
    },

    currency: {
      type: String,
      enum: ['PHP', 'USDC', 'ETH', 'MATIC'],
      default: 'PHP',
      index: true
    },

    phpEquivalent: {
      type: Number,
      default: null
    },

    rateAtSend: {
      type: Number,
      default: null
    },

    fee: {
      type: Number,
      default: 0
    },

    /**
     * TRANSACTION TYPE
     */
    type: {
      type: String,
      enum: ['transfer', 'cashin', 'cashout', 'remittance', 'swap'],
      default: 'transfer',
      index: true
    },

    /**
     * STATE MACHINE (VERY IMPORTANT)
     */
    status: {
      type: String,
      enum: ['pending', 'processing', 'settled', 'failed', 'reversed'],
      default: 'pending',
      index: true
    },

    /**
     * SETTLEMENT LAYER (BANK / PROVIDER)
     */
    settlementMethod: {
      type: String,
      enum: ['coinsph', 'maya', 'paymongo', 'bank', 'manual'],
      default: 'manual'
    },

    settlementRef: {
      type: String,
      default: null,
      index: true
    },

    /**
     * UNIQUE IDENTIFIERS
     */
    referenceId: {
      type: String,
      unique: true,
      required: true,
      index: true
    },

    /**
     * 🧠 IDEMPOTENCY KEY (CRITICAL FOR SAFETY)
     * Prevents duplicate transfers on retry/network errors
     */
    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    },

    /**
     * OPTIONAL NOTES / DEBUGGING
     */
    notes: {
      type: String,
      default: ''
    },

    /**
     * AUDIT / EXTENSION FIELD
     */
    metadata: {
      type: Object,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

/**
 * PERFORMANCE INDEXES
 */
transactionSchema.index({ senderId: 1, createdAt: -1 });
transactionSchema.index({ receiverAddress: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Transaction', transactionSchema);
