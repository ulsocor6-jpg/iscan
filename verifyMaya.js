import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Wallet from './src/models/walletModel.js';

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);

const wallet = await Wallet.findOne({
  linkedWallets: {
    $elemMatch: {
      provider: 'MAYA',
      accountNumber: '09171234567'
    }
  }
});

console.log(JSON.stringify(wallet,null,2));

process.exit(0);
