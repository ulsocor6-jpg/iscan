import mongoose from "mongoose";

const BlockchainCursorSchema = new mongoose.Schema(
  {
    //----------------------------------------------------
    // Chain Identity
    //----------------------------------------------------

    chain: {
      type: String,
      required: true,
      index: true,
    },

    network: {
      type: String,
      required: true,
      index: true,
    },

    //----------------------------------------------------
    // Scan Progress
    //----------------------------------------------------

    lastScannedBlock: {
      type: Number,
      required: true,
      default: 0,
    },

    lastScannedBlockHash: {
      type: String,
      default: null,
    },

    //----------------------------------------------------
    // Monitoring
    //----------------------------------------------------

    collector: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: [
        "RUNNING",
        "STOPPED",
        "ERROR"
      ],
      default: "RUNNING",
    },

    lastError: {
      type: String,
      default: null,
    },

    lastHeartbeat: {
      type: Date,
      default: Date.now,
    },

    //----------------------------------------------------
    // Statistics
    //----------------------------------------------------

    totalBlocksScanned: {
      type: Number,
      default: 0,
    },

    totalEventsCollected: {
      type: Number,
      default: 0,
    },

    totalDuplicatesIgnored: {
      type: Number,
      default: 0,
    }

  },
  {
    timestamps: true,
  }
);

/*
|--------------------------------------------------------------------------
| One cursor per chain/network
|--------------------------------------------------------------------------
*/

BlockchainCursorSchema.index(
  {
    chain: 1,
    network: 1,
  },
  {
    unique: true,
  }
);

export default mongoose.model(
  "BlockchainCursor",
  BlockchainCursorSchema
);
