import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { ethers } from 'ethers';

await mongoose.connect(process.env.MONGODB_URI);
const Wallet         = (await import('./src/models/walletModel.js')).default;
const DepositAddress = (await import('./src/models/depositAddressModel.js')).default;

const MNEMONIC = process.env.HD_WALLET_MNEMONIC;
const hdNode   = ethers.HDNodeWallet.fromPhrase(MNEMONIC, undefined, "m/44'/60'/2'/0");

const hdMap = {};
for (let i = 0; i <= 100; i++) {
  const child = hdNode.deriveChild(i);
  hdMap[child.address.toLowerCase()] = i;
}
console.log(`Built HD map: ${Object.keys(hdMap).length} addresses\n`);

const wallets = await Wallet.find({}).lean();

for (const wallet of wallets) {
  const baseAddr = wallet.chainAddresses?.find(c => c.chain === 'BASE')?.address?.toLowerCase();
  if (!baseAddr) continue;

  const hdIndex = hdMap[baseAddr];
  const isMock  = hdIndex === undefined;

  console.log(`${baseAddr} → ${isMock ? '⚠️  mock (no HD key)' : `HD index ${hdIndex}`}`);

  // Update or insert — use upsert on address field only (not address+token)
  const result = await DepositAddress.findOneAndUpdate(
    { address: baseAddr },
    {
      $set: {
        userId:  wallet.userId,
        chain:   'base',
        token:   'USDC',  // primary token
        status:  'active',
        ...(hdIndex !== undefined && { hdIndex })
      }
    },
    { upsert: true, new: true }
  );
  console.log(`  ${result.hdIndex !== undefined ? `✅ hdIndex=${result.hdIndex}` : '⚠️  no hdIndex (mock)'} | _id: ${result._id}`);
}

// Show final state
console.log('\n── Final DepositAddress state ──');
const all = await DepositAddress.find({ chain: 'base' }).lean();
all.forEach(d => console.log(`  ${d.address} | token:${d.token} | hdIndex:${d.hdIndex ?? 'NONE'} | status:${d.status}`));

await mongoose.disconnect();
console.log('\n✅ Done');
