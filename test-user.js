import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "./src/models/userModel.js";

dotenv.config();

await mongoose.connect(
  process.env.MONGODB_URI || process.env.MONGO_URL
);

const user = await User.findById(
  "6a2b546bad9ae11f2f193a7f"
).lean();

console.log(JSON.stringify(user, null, 2));

process.exit(0);
