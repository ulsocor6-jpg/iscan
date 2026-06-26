import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Wallet from './src/models/walletModel.js';

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);

const w = await Wallet.findOne();

if (!w) {
  console.log('NO WALLET FOUND');
  process.exit(0);
}

w.linkedWallets.push({
  address: 'MAYA-09171234567',
  provider: 'MAYA',
  accountNumber: '09171234567',
  accountName: 'Test Maya'
});

await w.save();

console.log('saved');
process.exit(0);
