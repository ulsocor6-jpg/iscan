/**
 * scripts/find-hd-index.js
 * -------------------------
 * READ-ONLY. Brute-force searches HD derivation indices to find which one
 * (if any) actually derives to the given address. Use this before ever
 * backfilling a DepositAddress record for a legacy address that predates
 * the DepositAddress/hdIndex tracking system — assigning some arbitrary
 * "next available" index would derive a completely different private key
 * and would NOT give control over the real address.
 *
 * If no match is found in range, this address was very likely generated
 * by the old SHA-256 fallback scheme mentioned in hdWalletService.js
 * ("previously this silently fell back to fake, non-derivable addresses")
 * — meaning there is no private key for it, ever. In that case the fix is
 * to rotate the user to a freshly, properly-derived address, not to keep
 * searching or to fabricate an index.
 *
 * Usage:
 *   node scripts/find-hd-index.js <address> [chain] [maxIndex]
 *   node scripts/find-hd-index.js 0x399da42ae7824a83034e066429a4d588a3644d19 BASE 5000
 *
 * chain defaults to BASE, maxIndex defaults to 5000 (adjust up if you have
 * more than 5000 users and it's not found).
 */
import 'dotenv/config';
import { deriveBaseAddress, deriveRoninAddress } from '../src/services/hdWalletService.js';

const target   = (process.argv[2] || '').toLowerCase();
const chain    = (process.argv[3] || 'BASE').toUpperCase();
const maxIndex = parseInt(process.argv[4], 10) || 5000;

if (!target) {
  console.error('Usage: node scripts/find-hd-index.js <address> [chain] [maxIndex]');
  process.exit(1);
}

const deriveFn = chain === 'RONIN' ? deriveRoninAddress : deriveBaseAddress;

async function main() {
  if (!process.env.HD_WALLET_MNEMONIC) {
    console.error('HD_WALLET_MNEMONIC is not set — cannot derive anything.');
    process.exit(1);
  }

  console.log(`Searching indices 0..${maxIndex} on ${chain} for ${target}...`);

  for (let i = 0; i <= maxIndex; i++) {
    const derived = await deriveFn(i);
    if (derived.address.toLowerCase() === target) {
      console.log(`\nFOUND: index ${i} derives to ${derived.address}`);
      console.log(`\nThis address IS recoverable. Backfill it with:`);
      console.log(`  node scripts/backfill-deposit-address.js <userId> ${chain} ${i}`);
      return;
    }
    if (i > 0 && i % 500 === 0) console.log(`  ...checked up to index ${i}`);
  }

  console.log(
    `\nNO MATCH found in 0..${maxIndex}.\n` +
    `This address does not derive from the current HD_WALLET_MNEMONIC at any` +
    ` checked index. Per hdWalletService.js's own comment, earlier versions of` +
    ` this codebase generated at least 3 wallets with a fake SHA-256-based scheme` +
    ` that has no real private key at all.\n\n` +
    `If this address's on-chain balance is 0 (verify with reconcile-balance.js` +
    ` or a block explorer), it's safe to rotate this user to a freshly, properly-` +
    ` derived BASE address before any real funds are ever sent to it.\n` +
    `If it has a nonzero on-chain balance, STOP and treat this as a genuine` +
    ` fund-recovery incident — do not attempt to move on until that's resolved.`
  );
}

main().catch(err => {
  console.error('Search failed:', err);
  process.exit(1);
});
