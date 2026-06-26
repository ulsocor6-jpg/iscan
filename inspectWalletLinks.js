import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Wallet from './src/models/walletModel.js';

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);

const wallets = await Wallet.find(
 {},
 {
   userId:1,
   linkedWallets:1,
   iscanAddress:1
 }
).lean();

console.log(JSON.stringify(wallets,null,2));

process.exit(0);
