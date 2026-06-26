import mongoose from "mongoose";
import dotenv from "dotenv";
import BankAccount from "./src/models/BankAccount.js";

dotenv.config();

await mongoose.connect(
  process.env.MONGODB_URI || process.env.MONGO_URL
);

console.log("Model collection:", BankAccount.collection.name);

const docs = await BankAccount.find({}).lean();

console.log("Count:", docs.length);

for (const d of docs) {
  console.log(JSON.stringify(d, null, 2));
}

process.exit(0);
