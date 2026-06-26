import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DirectDeposit from './src/models/DirectDepositModel.js';

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);

const d = await DirectDeposit.findOne().sort({ createdAt: -1 });

if (!d) {
  console.log('NO ACTIVE DEPOSITS FOUND');
  process.exit(0);
}

console.log('reference=', d.referenceId);
console.log('created=', d.createdAt);
console.log('expires=', d.expiresAt);

console.log(
  'minutes=',
  (new Date(d.expiresAt) - new Date(d.createdAt)) / 60000
);

process.exit(0);
