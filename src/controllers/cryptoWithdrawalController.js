import WithdrawalRequest from "../models/withdrawalRequestModel.js";
import walletService from "../services/walletService.js";

const SUPPORTED_ASSETS = ["BTC", "ETH", "USDT", "USDC", "SOL", "BNB", "FLOWER"];

const NETWORK_MAP = {
  BTC:    ["Bitcoin", "Lightning"],
  ETH:    ["ERC-20", "Base", "Arbitrum", "Optimism"],
  USDT:   ["ERC-20", "TRC-20", "BEP-20", "Solana"],
  USDC:   ["ERC-20", "Base", "Arbitrum", "Solana"],
  SOL:    ["Solana"],
  BNB:    ["BEP-20", "BEP-2"],
  FLOWER: ["Base"],
};

const MINIMUMS = {
  "Bitcoin": 0.0001, "Lightning": 0.000001,
  "ERC-20": 0.01, "TRC-20": 1, "BEP-20": 0.5, "BEP-2": 0.001,
  "Base": 0.01, "Arbitrum": 0.01, "Optimism": 0.01, "Solana": 0.01,
};

const NETWORK_FEES = {
  "Bitcoin": 0.00005, "Lightning": 0.000001,
  "ERC-20": 0.0008, "TRC-20": 1, "BEP-20": 0.0005, "BEP-2": 0.00037,
  "Base": 0.00002, "Arbitrum": 0.00004, "Optimism": 0.00003, "Solana": 0.00025,
};

function isValidAddress(address, network) {
  if (!address || typeof address !== "string") return false;
  const a = address.trim();
  switch (network) {
    case "Bitcoin":
      return /^(1|3)[a-zA-HJ-NP-Z0-9]{25,34}$/.test(a) || /^bc1[a-zA-HJ-NP-Z0-9]{6,87}$/.test(a);
    case "Lightning":
      return /^ln(bc|tb)[0-9a-zA-Z]+$/.test(a);
    case "TRC-20": case "BEP-2":
      return /^T[a-zA-Z0-9]{33}$/.test(a) || /^bnb[a-zA-Z0-9]{39}$/.test(a);
    case "Solana":
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);
    case "ERC-20": case "Base": case "Arbitrum": case "Optimism": case "BEP-20":
      return /^0x[a-fA-F0-9]{40}$/.test(a);
    default:
      return a.length >= 20;
  }
}

export async function createCryptoWithdrawal(req, res) {
  try {
    const { asset, network, amount, destinationAddress } = req.body;

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

    if (!isValidAddress(destinationAddress, network))
      return res.status(400).json({ error: `Invalid ${network} address format` });

    const balance = await walletService.getBalance(req.user.id, asset);
    const fee = NETWORK_FEES[network] || 0;
    const totalRequired = parsedAmount + fee;

    if (balance < totalRequired)
      return res.status(400).json({ error: `Insufficient ${asset}. Need ${totalRequired} (${parsedAmount} + ${fee} fee), have ${balance}` });

    const withdrawal = await WithdrawalRequest.create({
      userId: req.user.id,
      type: "crypto",
      asset,
      network,
      amount: parsedAmount,
      destinationAddress: destinationAddress.trim(),
      status: "pending_review",
    });

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
