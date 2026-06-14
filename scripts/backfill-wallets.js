import dotenv from 'dotenv';
dotenv.config();

import connectDB from '../config/db.js';
import User from '../src/models/userModel.js';
import WalletService from '../src/services/walletService.js';

async function backfill() {
  await connectDB();

  const users = await User.find({}, '_id email');

  console.log(`Found ${users.length} users`);

  let created = 0;
  let skipped = 0;

  for (const user of users) {
    const wallet = await WalletService.getOrCreateWallet(user._id);

    await User.findByIdAndUpdate(user._id, {
      walletId: wallet._id
    });

    created++;
    console.log(`✓ ensured wallet for ${user.email}`);
  }

  console.log(`Done. Processed: ${created}`);
  process.exit(0);
}

backfill().catch(err => {
  console.error(err);
  process.exit(1);
});
