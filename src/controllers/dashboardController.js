import mongoose from "mongoose";
import Wallet from "../models/walletModel.js";
import Ledger from "../models/ledgerModel.js";
import { getRate } from "../services/fx/rateProvider.js";
import { getLiveBalancesForWallet } from "../services/onchainBalanceService.js";

const _rateCache = {};
const _rateCacheMs = 60_000;

const getCachedRate = async (currency) => {
  const now = Date.now();
  if (_rateCache[currency] && now - _rateCache[currency].ts < _rateCacheMs) {
    return _rateCache[currency].rate;
  }
  try {
    const rate = await getRate(currency);
    if (rate) _rateCache[currency] = { rate, ts: now };
    return rate || 0;
  } catch { return 0; }
};

const getAssetBalances = async (userId) => {
  const result = await Ledger.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $group: { _id: "$currency", credit: { $sum: { $ifNull: ["$credit", 0] } }, debit: { $sum: { $ifNull: ["$debit", 0] } } } }
  ]);
  const balances = {};
  result.forEach(asset => { balances[asset._id] = asset.credit - asset.debit; });
  return balances;
};

const toPHP = async (currency, amount) => {
  if (!amount) return 0;
  if (currency === "PHP") return amount;
  const rate = await getCachedRate(currency);
  return rate ? amount * rate : 0;
};

// Crypto assets shown in the hero balance should reflect what's actually
// on-chain, not the Ledger's own bookkeeping — the Ledger can drift from
// reality (a swap that failed halfway, a stranded deposit, etc). PHP has
// no chain representation, so it's the one balance that legitimately
// stays Ledger-based.
const ONCHAIN_AGGREGATE_TOKENS = ["USDT", "USDC", "FLOWER"];

const sumOnchainByToken = (onchainBalances) => {
  const totals = {};
  ONCHAIN_AGGREGATE_TOKENS.forEach(t => { totals[t] = 0; });
  for (const chainData of Object.values(onchainBalances || {})) {
    if (!chainData || chainData.error) continue;
    for (const token of ONCHAIN_AGGREGATE_TOKENS) {
      if (typeof chainData[token] === "number") {
        totals[token] += chainData[token];
      }
    }
  }
  return totals;
};

export const getDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const wallet = await Wallet.findOne({ userId });
    const balances = await getAssetBalances(userId);

    let onchainBalances = {};
    try {
      onchainBalances = wallet ? await getLiveBalancesForWallet(wallet) : {};
    } catch (err) {
      console.error("[DASHBOARD] on-chain balance fetch failed:", err.message);
    }

    // Ledger balances stay as the base (covers PHP and anything not tracked
    // on-chain), then real on-chain totals overwrite USDT/USDC/FLOWER so the
    // hero balance can never disagree with the Wallet Portfolio panel below it.
    const onchainTotals = sumOnchainByToken(onchainBalances);
    const mergedBalances = { ...balances, ...onchainTotals };

    const phpConversions = await Promise.all(
      Object.entries(mergedBalances)
        .filter(([, amount]) => amount > 0)
        .map(async ([currency, amount]) => ({
          currency, amount, php: await toPHP(currency, amount)
        }))
    );

    const totalBalancePHP = phpConversions.reduce((sum, c) => sum + c.php, 0);

    const recentTransactions = await Ledger.find({ userId }).sort({ createdAt: -1 }).limit(20).lean();

    const NATIVE_SYMBOL = { ETHEREUM: "ETH", POLYGON: "MATIC", BASE: "ETH", RONIN: "RON" };
    const CHAIN_LABEL = { ETHEREUM: "Ethereum", POLYGON: "Polygon", BASE: "Base", RONIN: "Ronin" };
    const CHAIN_COLOR = { ETHEREUM: "#627EEA", POLYGON: "#8247E5", BASE: "#0052FF", RONIN: "#1273EA" };

    const portfolio = Object.entries(onchainBalances).map(([chain, data]) => ({
      type: "internal",
      network: CHAIN_LABEL[chain] || chain,
      chain,
      token: NATIVE_SYMBOL[chain] || "—",
      color: CHAIN_COLOR[chain] || "#1d2942",
      balance: data.native ?? 0,
      usdc: data.USDC ?? 0,
      address: data.address,
    }));

    return res.json({
      success: true,
      wallet: {
        id: wallet?.iscanAddress,
        iscanAddress: wallet?.iscanAddress,
        linkedWallets: wallet?.linkedWallets || []
      },
      balances: mergedBalances,
      onchainBalances,
      portfolio,
      hero: { totalBalancePHP, breakdown: phpConversions },
      recentTransactions
    });
  } catch (err) {
    console.error("[DASHBOARD ERROR]", err);
    return res.status(500).json({ success: false, message: "Failed to load dashboard" });
  }
};
