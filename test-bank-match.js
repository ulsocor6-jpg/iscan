import mongoose from "mongoose";
import dotenv from "dotenv";
import BankAccount from "./src/models/BankAccount.js";

dotenv.config();

await mongoose.connect(
  process.env.MONGODB_URI || process.env.MONGO_URL
);

const bankAccount = await BankAccount.findOne({
  accountName: {
    $regex: /RAUL ROCO/i
  },
  accountNumber: {
    $regex: /7726$/
  }
}).lean();

console.log(JSON.stringify(bankAccount, null, 2));

process.exit(0);
