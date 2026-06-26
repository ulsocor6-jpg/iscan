import mongoose from 'mongoose';
import app from './app.js';
import { startSettlementWorker } from './src/services/settlement/index.js';
import { startRoninListener } from './src/services/blockchain/roninListener.js';
import { startBaseListener } from './src/services/blockchain/baseListener.js';
import { startStatusWorker } from './src/workers/statusWorker.js';
import { startTreasuryBalancer } from './src/services/treasury/treasuryBalancer.js';
import { startMariBankListener } from './src/services/ingestion/maribankEmailListener.js';
import { startDepositExpiryWorker } from "./src/services/depositExpiryWorker.js";
import mayaNotifyRoute from './src/routes/mayaNotifyRoute.js';

async function startServer() {
  try {
    console.log("Connecting to MongoDB...");

    const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URL;
    if (!mongoUrl) {
      throw new Error("MONGODB_URI is not set in .env");
    }

    await mongoose.connect(mongoUrl);
    console.log("MongoDB connected");

    try {
      startSettlementWorker();
    } catch (err) {
      console.error("Settlement worker failed to start (continuing anyway):", err.message);
    }

    try {
      startRoninListener();
    try {
      startBaseListener();
    } catch (err) {
      console.error("Base listener failed to start (continuing anyway):", err.message);
    }
    try {
      startTreasuryBalancer();
      try { startStatusWorker(); } catch (err) { console.error('Status worker failed to start:', err.message); }
    } catch (err) {
      console.error("Treasury balancer failed to start (continuing anyway):", err.message);
    }
    } catch (err) {
      console.error("Ronin listener failed to start (continuing anyway):", err.message);
    }

    try {
      startMariBankListener();
      try {
        startDepositExpiryWorker();
      } catch (err) {
        console.error("Deposit expiry worker failed:", err.message);
      }
    } catch (err) {
      console.error("MariBank listener failed to start (continuing anyway):", err.message);
    }

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log("ISCAN running on port", PORT);
    });

  } catch (err) {
    console.error("Server failed to start:", err);
    process.exit(1);
  }
}

startServer();
