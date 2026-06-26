import mongoose from "mongoose";
import dotenv from "dotenv";
import BankAccount from "./src/models/BankAccount.js";

dotenv.config();

await mongoose.connect(
  process.env.MONGODB_URI || process.env.MONGO_URL
);

const senderName = "RAUL ROCO";
const senderLastFour = "4726";

const results = await BankAccount.find({
  accountName: {
    $regex: new RegExp(senderName, "i")
  }
}).lean();

console.log("NAME MATCHES");
console.log(JSON.stringify(results, null, 2));

const results2 = await BankAccount.find({
  accountNumber: {
    $regex: /4726$/
  }
}).lean();

console.log("LAST4 MATCHES");
console.log(JSON.stringify(results2, null, 2));

process.exit(0);
