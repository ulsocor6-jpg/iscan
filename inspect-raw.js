import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

await mongoose.connect(
  process.env.MONGODB_URI || process.env.MONGO_URL
);

const cols = await mongoose.connection.db.listCollections().toArray();

console.log(cols.map(c => c.name));

process.exit(0);
