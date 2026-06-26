import mongoose from "mongoose";
import dotenv from "dotenv";
import BankAccount from "./src/models/BankAccount.js";

dotenv.config();

await mongoose.connect(
  process.env.MONGODB_URI || process.env.MONGO_URL
);

console.log("\n=== Exact accountName ===");
console.log(
  await BankAccount.findOne({
    accountName: "RAUL ROCO"
  }).lean()
);

console.log("\n=== Ends with 7726 ===");
console.log(
  await BankAccount.findOne({
    accountNumber: { $regex: /7726$/ }
  }).lean()
);

console.log("\n=== Both ===");
console.log(
  await BankAccount.findOne({
    accountName: "RAUL ROCO",
    accountNumber: { $regex: /7726$/ }
  }).lean()
);

process.exit(0);
