import mongoose from "mongoose";
import dotenv from "dotenv";
import { expireDeposits } from "./src/services/depositExpiryWorker.js";

dotenv.config();

await mongoose.connect(
  process.env.MONGODB_URI || process.env.MONGO_URL
);

await expireDeposits();

process.exit(0);
