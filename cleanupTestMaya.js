import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Wallet from './src/models/walletModel.js';

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);

const wallet = await Wallet.findOne({
  "linkedWallets.accountNumber": "09171234567"
});

wallet.linkedWallets =
wallet.linkedWallets.filter(
 (v,i,a) =>
 i === a.findIndex(
  x =>
   x.provider === v.provider &&
   x.accountNumber === v.accountNumber
 )
);

await wallet.save();

console.log('duplicates removed');

process.exit(0);
