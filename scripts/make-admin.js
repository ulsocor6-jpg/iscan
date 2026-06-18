import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../src/models/userModel.js";

dotenv.config();
const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/make-admin.js <email>");
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URL);
const user = await User.findOneAndUpdate(
  { email: email.toLowerCase() },
  { role: "admin" },
  { new: true }
);
console.log(user ? `${user.email} is now role=admin` : "No user found with that email.");
await mongoose.disconnect();
