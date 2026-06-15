import mongoose from 'mongoose';
import app from './app.js';
import { startSettlementWorker } from './src/services/settlement/index.js';
import { startRoninListener } from './src/services/blockchain/roninListener.js';

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
    } catch (err) {
      console.error("Ronin listener failed to start (continuing anyway):", err.message);
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
