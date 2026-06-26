import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

await mongoose.connect(
  process.env.MONGODB_URI || process.env.MONGO_URL
);

const accounts =
  await mongoose.connection.db
    .collection("bankaccounts")
    .find({})
    .toArray();

console.log(JSON.stringify(accounts, null, 2));

process.exit(0);
