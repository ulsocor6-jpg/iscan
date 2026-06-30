import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Wallet from '../src/models/walletModel.js';
import Ledger from '../src/models/ledgerModel.js';
import { getLiveBalancesForWallet } from '../src/services/onchainBalanceService.js';

const userId = process.argv[2];
if (!userId) {
  console.error('Usage: node scripts/compare-usdc.js <userId>');
  process.exit(1);
}

async function main() {
  await connectDB();
  const wallet = await Wallet.findOne({ userId: new mongoose.Types.ObjectId(userId) }).lean();
  if (!wallet) { console.error('No wallet found.'); process.exit(1); }

  const ledgerResult = await Ledger.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId), currency: 'USDC' } },
    { $group: { _id: null, credit: { $sum: { $ifNull: ['$credit', 0] } }, debit: { $sum: { $ifNull: ['$debit', 0] } } } },
  ]);
  const ledgerUSDC = ledgerResult.length ? ledgerResult[0].credit - ledgerResult[0].debit : 0;
  const onchain = await getLiveBalancesForWallet(wallet);

  console.log('=== USDC COMPARISON ===');
  console.log(`Ledger-derived USDC balance (what swap checks against): ${ledgerUSDC}`);
  console.log('');
  console.log('Real on-chain USDC balance per chain:');
  for (const [chain, data] of Object.entries(onchain)) {
    if (data.error) console.log(`  ${chain}: ERROR — ${data.error}`);
    else console.log(`  ${chain}: ${data.USDC ?? 'n/a'}`);
  }
  await mongoose.disconnect();
}

main().catch(err => { console.error('[COMPARE ERROR]', err); process.exit(1); });
