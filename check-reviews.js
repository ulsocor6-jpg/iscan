import mongoose from "mongoose";
import dotenv from "dotenv";
import DepositReview from "./src/models/depositReviewModel.js";

dotenv.config();

await mongoose.connect(
  process.env.MONGODB_URI || process.env.MONGO_URL
);

const docs = await DepositReview.find({})
.sort({ createdAt: -1 })
.limit(10)
.lean();

console.log(JSON.stringify(docs,null,2));

process.exit(0);
