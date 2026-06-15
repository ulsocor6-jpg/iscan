const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

// =============================
// DB CONNECTION
// =============================
async function startServer() {
  try {
    console.log("Connecting to MongoDB...");

    await mongoose.connect(process.env.MONGO_URL);

    console.log("MongoDB connected");

    // START SETTLEMENT WORKER (SAFE REQUIRE)
    const { startSettlementWorker } = require('./src/services/settlement');
    startSettlementWorker();

    const PORT = process.env.PORT || 3000;

    app.listen(PORT, () => {
      console.log("ISCAN running on port", PORT);
    });

  } catch (err) {
    console.error("DB connection failed:", err);
  }
}

startServer();
