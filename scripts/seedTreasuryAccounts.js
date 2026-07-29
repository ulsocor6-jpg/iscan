import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import TreasuryAccount from '../src/models/treasuryAccountModel.js';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost/iscan';

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  await TreasuryAccount.deleteMany({ currency: 'PHP' });

  await TreasuryAccount.insertMany([
    {
      currency: 'PHP', provider: 'maya', accountLabel: 'Maya Main',
      physicalBalance: 25000, reserved: 0, pendingIncoming: 0, pendingOutgoing: 0,
      safetyReserve: 500, isActive: true,
    },
    {
      currency: 'PHP', provider: 'gcash', accountLabel: 'GCash #1',
      physicalBalance: 30000, reserved: 0, pendingIncoming: 0, pendingOutgoing: 0,
      safetyReserve: 1000, isActive: true,
    },
    {
      currency: 'PHP', provider: 'bank_bpi', accountLabel: 'BPI Business',
      physicalBalance: 80000, reserved: 0, pendingIncoming: 0, pendingOutgoing: 0,
      safetyReserve: 5000, isActive: true,
    },
    {
      currency: 'PHP', provider: 'maribank', accountLabel: 'MariBank Main',
      physicalBalance: 20000, reserved: 0, pendingIncoming: 0, pendingOutgoing: 0,
      safetyReserve: 500, isActive: true,
    },
  ]);

  console.log('✅ Treasury accounts seeded');
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
