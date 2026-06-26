import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './src/models/userModel.js';

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);

const users = await User.find(
 {},
 {
  email:1,
  linkedWallets:1
 }
).lean();

console.log(
 JSON.stringify(users,null,2)
);

process.exit(0);
