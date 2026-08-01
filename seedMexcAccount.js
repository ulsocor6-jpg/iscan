import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import TreasuryAccount from '../src/models/treasuryAccountModel.js';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost/iscan';

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Idempotent by design (unlike seedTreasuryAccounts.js's deleteMany+insertMany
  // reset pattern) — this only INSERTS if missing, never deletes, since this
  // account may hold a real live balance by the time this is re-run.
  const existing = await TreasuryAccount.findOne({ provider: 'mexc', currency: 'USDC' });

  if (existing) {
    console.log('MEXC USDC TreasuryAccount already exists:', existing._id.toString());
  } else {
    const account = await TreasuryAccount.create({
      currency: 'USDC',
      provider: 'mexc',
      accountLabel: 'MEXC Spot Wallet',
      physicalBalance: 0,
      reserved: 0,
      pendingIncoming: 0,
      pendingOutgoing: 0,
      safetyReserve: 0,
      isActive: true,
    });
    console.log('✅ Created MEXC USDC TreasuryAccount:', account._id.toString());
  }

  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
