import WithdrawalRequest from "../models/withdrawalRequestModel.js";
import walletService from "../services/walletService.js";
import { settleCryptoWithdrawal, exceedsAutoApproveLimit } from "../services/withdrawalProcessor.js";
import { estimateNetworkFee } from "../services/treasury/gasEstimationService.js";

// Only assets/chains we actually have treasury infrastructure for right
// now (real private keys + contract addresses in treasurySendService.js).
// Everything else in the UI is shown as "SOON" and not accepted here yet.
const SUPPORTED_ASSETS = ["USDC", "USDT", "FLOWER"];

const NETWORK_MAP = {
  USDC:   ["BASE", "RONIN"],
  // No RONIN_USDT_TOKEN configured yet — BASE only until that's set up.
  USDT:   ["BASE"],
  FLOWER: ["BASE", "RONIN"],
};

const MINIMUMS = {
  BASE:  0.01,
  RONIN: 0.01,
};

// Static values kept only as a last-resort fallback — actual fee is now
// computed live per request via gasEstimationService (real gas price +
// real gas units + live native-token price, converted into the asset
// being withdrawn).
const NETWORK_FEES = {
  BASE:  0.02,
  RONIN: 1.0,
};

// Ronin addresses are sometimes displayed with a "ronin:" prefix instead
// of "0x" — same underlying hex, just a different convention. Normalize
// to 0x since that is what ethers/treasurySendService expects.
function normalizeAddress(address, network) {
  if (network === "RONIN" && address?.toLowerCase().startsWith("ronin:")) {
    return "0x" + address.slice(6);
  }
  return address;
}

function isValidAddress(address) {
  // Both BASE and RONIN are EVM-compatible — same 0x + 40 hex char format.
  return typeof address === "string" && /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}

export async function createCryptoWithdrawal(req, res) {
  try {
    const { asset, amount, destinationAddress } = req.body;
    const network = (req.body.network || "").toUpperCase();

    if (!SUPPORTED_ASSETS.includes(asset))
      return res.status(400).json({ error: `Unsupported asset: ${asset}` });

    const validNetworks = NETWORK_MAP[asset] || [];
    if (!validNetworks.includes(network))
      return res.status(400).json({ error: `Network "${network}" not supported for ${asset}. Valid: ${validNetworks.join(", ")}` });

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0)
      return res.status(400).json({ error: "Invalid amount" });

    const minimum = MINIMUMS[network] || 0;
    if (parsedAmount < minimum)
      return res.status(400).json({ error: `Minimum withdrawal on ${network} is ${minimum} ${asset}` });

    const normalizedAddress = normalizeAddress(destinationAddress, network);
    if (!isValidAddress(normalizedAddress))
      return res.status(400).json({ error: `Invalid ${network} address format` });

    const balance = await walletService.getBalance(req.user.id, asset);

    const feeResult = await estimateNetworkFee({
      chain: network,
      asset,
      toAddress: normalizedAddress,
      amount: parsedAmount,
    });
    const fee = feeResult.fee || NETWORK_FEES[network] || 0;
    if (!feeResult.estimated) {
      console.warn(`[cryptoWithdrawal] live fee estimate failed, using fallback ${fee} ${asset} for ${network}`);
    }

    const totalRequired = parsedAmount + fee;

    if (balance < totalRequired)
      return res.status(400).json({ error: `Insufficient ${asset}. Need ${totalRequired} (${parsedAmount} + ${fee} fee), have ${balance}` });

    const withdrawal = await WithdrawalRequest.create({
      userId: req.user.id,
      type: "crypto",
      asset,
      network,
      amount: parsedAmount,
      destinationAddress: normalizedAddress.trim(),
      status: "pending_review",
    });

    // Same auto-settle rule as the other withdrawal path: settle
    // immediately unless it exceeds a configured AUTO_WITHDRAW_LIMIT_<ASSET>.
    if (!exceedsAutoApproveLimit(withdrawal)) {
      const result = await settleCryptoWithdrawal(withdrawal);
      if (!result.success) {
        const message = result.stage === "debit"
          ? `Withdrawal request created, but could not be settled (insufficient balance at settle time): ${result.error}`
          : `Withdrawal request created, but the on-chain send failed and was reversed: ${result.error}`;
        return res.status(502).json({
          success: false,
          error: message,
          withdrawal: result.withdrawal,
        });
      }
    }

    return res.status(201).json({
      success: true,
      withdrawal: {
        id: withdrawal._id,
        asset, network,
        amount: parsedAmount,
        fee,
        willReceive: parsedAmount - fee,
        destinationAddress: withdrawal.destinationAddress,
        status: withdrawal.status,
        txHash: withdrawal.txHash || null,
        createdAt: withdrawal.createdAt,
      },
    });
  } catch (err) {
    console.error("[cryptoWithdrawal] error:", err);
    res.status(500).json({ error: err.message });
  }
}

export async function getCryptoWithdrawals(req, res) {
  try {
    const withdrawals = await WithdrawalRequest.find({ userId: req.user.id, type: "crypto" })
      .sort({ createdAt: -1 }).limit(50);
    res.json({ withdrawals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
