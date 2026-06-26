import mongoose from "mongoose";
import dotenv from "dotenv";
import BankAccount from "./src/models/BankAccount.js";

dotenv.config();

await mongoose.connect(
  process.env.MONGODB_URI || process.env.MONGO_URL
);

const acc = await BankAccount.findOne({
  provider: "bank"
}).lean();

console.log(acc.accountNumber);
console.log(acc.accountNumber.length);
console.log(
  [...acc.accountNumber].map(c => c.charCodeAt(0))
);

process.exit(0);
