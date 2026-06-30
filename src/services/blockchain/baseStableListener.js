// src/services/blockchain/baseStableListener.js
// Watches Base chain deposit addresses for USDC/USDT deposits
// then sweeps them to treasury and credits the user's ledger.

import { ethers }            from "ethers";
import DepositAddress        from "../../models/depositAddressModel.js";
import { createDetectedDeposit } from "../cryptoDepositPipeline.js";
import { deriveBaseAddress } from "../hdWalletService.js";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

// Hardcode decimals — some Base tokens don't expose decimals()
const TOKEN_DECIMALS = {
  USDC: 6,
  USDT: 6,
};

const BASE_RPC           = process.env.BASE_RPC || "https://mainnet.base.org";
const TREASURY_WALLET    = process.env.BASE_TREASURY_WALLET;
const TREASURY_PRIV_KEY  = process.env.BASE_TREASURY_PRIVATE_KEY;

const TOKENS = {
  USDC: process.env.BASE_USDC_TOKEN || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  USDT: process.env.BASE_USDT_TOKEN || "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
};

const provider = new ethers.JsonRpcProvider(BASE_RPC);

async function checkAndSweep(addr) {
  for (const [symbol, tokenAddress] of Object.entries(TOKENS)) {
    try {
      const token    = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const decimals = TOKEN_DECIMALS[symbol] || 6;
      const balance  = await token.balanceOf(addr.address);

      if (balance === 0n) continue;

      const amount = parseFloat(ethers.formatUnits(balance, decimals));
      if (amount < 0.01) continue;

      console.log(`[BASE STABLE] Detected ${amount} ${symbol} at ${addr.address}`);

      // Record deposit in DB
      await createDetectedDeposit({
        userId:  addr.userId,
        token:   symbol,
        amount,
        txHash:  `${addr.address}-${symbol}-${Date.now()}`,
        address: addr.address,
        chain:   "base"
      });

      // Sweep to treasury
      if (addr.hdIndex !== null && TREASURY_WALLET) {
        try {
          const derived = await deriveBaseAddress(addr.hdIndex);
          if (!derived?.privateKey) throw new Error("No private key derived");

          const signer      = new ethers.Wallet(derived.privateKey, provider);
          const tokenSigner = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

          // Check ETH for gas — skip sweep if insufficient
          const ethBal = await provider.getBalance(addr.address);
          if (ethBal < ethers.parseEther("0.0001")) {
            console.warn(`[BASE STABLE] ${addr.address} has no ETH for gas — sweep skipped, deposit recorded`);
            continue;
          }

          const tx      = await tokenSigner.transfer(TREASURY_WALLET, balance);
          const receipt = await tx.wait();
          console.log(`[BASE STABLE] ✅ Swept ${amount} ${symbol} → treasury | tx: ${receipt.hash}`);

          addr.lastTxHash = receipt.hash;
          addr.lastAmount = amount;
          await addr.save();

        } catch (sweepErr) {
          console.error(`[BASE STABLE] Sweep failed for ${addr.address}:`, sweepErr.message);
        }
      }

    } catch (err) {
      console.error(`[BASE STABLE] Error checking ${symbol} at ${addr.address}:`, err.message);
    }
  }
}

export async function startBaseStableListener() {
  if (!TREASURY_WALLET) {
    console.error("[BASE STABLE] BASE_TREASURY_WALLET not set — not started");
    return;
  }

  console.log("[BASE STABLE] Starting USDC/USDT listener on Base — polling every 30s");

  setInterval(async () => {
    try {
      const addresses = await DepositAddress.find({
        chain:  "base",
        token:  { $in: ["USDC", "USDT"] },
        status: "active"
      });

      for (const addr of addresses) {
        await checkAndSweep(addr);
      }
    } catch (err) {
      console.error("[BASE STABLE ERROR]", err.message);
    }
  }, 30000);
}
