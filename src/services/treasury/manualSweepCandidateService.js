import Wallet from '../../models/walletModel.js';
import { estimateGasCostUSD } from '../fx/gasEstimator.js';

const SWEEPABLE_CHAINS = ['base', 'ronin'];
const SWEEPABLE_TOKENS = ['USDC', 'USDT'];

export async function getSweepCandidates({ minNetValueUSD = 2 } = {}) {
  const wallets = await Wallet.find({
    walletIndex: { $ne: null },
    $or: [
      { 'chainAddresses.usdcBalance': { $gt: 0 } },
      { 'chainAddresses.usdtBalance': { $gt: 0 } },
    ],
  }).lean();

  const gasCostCache = {};
  async function gasCostFor(chain) {
    const key = chain.toLowerCase();
    if (!(key in gasCostCache)) {
      gasCostCache[key] = await estimateGasCostUSD(key).catch(() => 0);
    }
    return gasCostCache[key];
  }

  const candidates = [];

  for (const wallet of wallets) {
    for (const ca of wallet.chainAddresses || []) {
      const chain = ca.chain?.toLowerCase();
      if (!SWEEPABLE_CHAINS.includes(chain)) continue;

      for (const token of SWEEPABLE_TOKENS) {
        const balance = token === 'USDC' ? ca.usdcBalance : ca.usdtBalance;
        if (!balance || balance <= 0) continue;

        const gasCostUSD = await gasCostFor(chain);
        const netValueUSD = balance - gasCostUSD;

        if (netValueUSD < minNetValueUSD) continue;

        candidates.push({
          userId: wallet.userId,
          walletIndex: wallet.walletIndex,
          chain,
          token,
          address: ca.address,
          balance,
          estGasCostUSD: parseFloat(gasCostUSD.toFixed(4)),
          netValueUSD: parseFloat(netValueUSD.toFixed(4)),
          lastSynced: ca.lastSynced,
        });
      }
    }
  }

  candidates.sort((a, b) => b.netValueUSD - a.netValueUSD);

  return candidates;
}

export default { getSweepCandidates };
