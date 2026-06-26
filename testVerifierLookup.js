import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './src/models/userModel.js';

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);

const senderAccount = "09171234567";

const user = await User.findOne({
 linkedWallets: {
  $elemMatch: {
   provider: "MAYA",
   accountNumber: senderAccount
  }
 }
});

console.log(user);

process.exit(0);
