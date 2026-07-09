import mongoose from "mongoose";

const WorkerSchema = new mongoose.Schema(
  {
    done: {
      type: Boolean,
      default: false,
    },

    updatedAt: {
      type: Date,
      default: null,
    },

    error: {
      type: String,
      default: null,
    },
  },
  { _id: false }
);

const BlockchainInboxSchema = new mongoose.Schema(
  {
    //---------------------------------
    // Chain Information
    //---------------------------------

    chain: {
      type: String,
      required: true,
      index: true,
    },

    network: {
      type: String,
      required: true,
    },

    //---------------------------------
    // Block Information
    //---------------------------------

    blockNumber: {
      type: Number,
      required: true,
      index: true,
    },

    blockHash: {
      type: String,
      required: true,
    },

    txHash: {
      type: String,
      required: true,
      index: true,
    },

    logIndex: {
      type: Number,
      required: true,
    },

    //---------------------------------
    // Event Information
    //---------------------------------

    contract: {
      type: String,
      required: true,
      index: true,
    },

    eventName: {
      type: String,
      required: true,
    },

    token: {
      type: String,
      default: null,
    },

    decimals: {
      type: Number,
      default: null,
    },

    //---------------------------------
    // Transfer Data
    //---------------------------------

    from: {
      type: String,
      default: null,
      index: true,
    },

    to: {
      type: String,
      default: null,
      index: true,
    },

    value: {
      type: String,
      default: null,
    },

    //---------------------------------
    // Metadata
    //---------------------------------

    timestamp: {
      type: Date,
      default: null,
    },

    confirmations: {
      type: Number,
      default: 0,
    },

    requiredConfirmations: {
      type: Number,
      default: 20,
    },

    confirmedAt: {
      type: Date,
      default: null,
    },

    processingStartedAt: {
      type: Date,
      default: null,
    },

    creditedAt: {
      type: Date,
      default: null,
    },

    currentStage: {
      type: String,
      default: "Collector",
      index: true,
    },

    status: {
      type: String,
      enum: [
        "NEW",
        "MATCHED",
        "CONFIRMED",
        "PROCESSED",
        "FAILED"
      ],
      default: "NEW",
      index: true,
    },

    //---------------------------------
    // Which workers processed this?
    //---------------------------------

    workers: {

      deposit: {
        type: WorkerSchema,
        default: () => ({})
      },

      flower: {
        type: WorkerSchema,
        default: () => ({})
      },

      treasury: {
        type: WorkerSchema,
        default: () => ({})
      },

      settlement: {
        type: WorkerSchema,
        default: () => ({})
      },

      wallet: {
        type: WorkerSchema,
        default: () => ({})
      },

      ledger: {
        type: WorkerSchema,
        default: () => ({})
      },

      dashboard: {
        type: WorkerSchema,
        default: () => ({})
      }

    },

    //---------------------------------
    // Raw Blockchain Log
    //---------------------------------

    watch: {

      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },

      address: {
        type: String,
        default: null,
      },

      chain: {
        type: String,
        default: null,
      },

      token: {
        type: String,
        default: null,
      },

      hdIndex: {
        type: Number,
        default: null,
      },

    },

    raw: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    //---------------------------------
    // Auto Cleanup
    //---------------------------------

    expireAt: {
      type: Date,
      default: null,
      index: true,
    }

  },
  {
    timestamps: true,
  }
);

/*
|--------------------------------------------------------------------------
| Never store the exact same blockchain event twice.
|--------------------------------------------------------------------------
*/

BlockchainInboxSchema.index(
  {
    chain: 1,
    txHash: 1,
    logIndex: 1,
  },
  {
    unique: true,
  }
);

/*
|--------------------------------------------------------------------------
| Fast lookups
|--------------------------------------------------------------------------
*/

BlockchainInboxSchema.index({
  chain: 1,
  blockNumber: 1,
});

BlockchainInboxSchema.index({
  chain: 1,
  to: 1,
});

BlockchainInboxSchema.index({
  status: 1,
});

export default mongoose.model(
  "BlockchainInbox",
  BlockchainInboxSchema
);
