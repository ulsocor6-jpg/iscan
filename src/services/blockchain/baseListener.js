// src/services/blockchain/baseListener.js
import { ethers }                    from "ethers";
import crypto                        from "crypto";
import DepositAddress                from "../../models/depositAddressModel.js";
import FlowerOrder                   from "../../models/flower/flowerOrderModel.js";
import { processSwap }               from "../flowerSwapServiceBase.js";
import { sweepFlowerToTreasuryBase } from "../flower/flowerSweepServiceBase.js";

const provider = new ethers.JsonRpcProvider(
  process.env.BASE_RPC || "https://mainnet.base.org"
);

const FLOWER_TOKEN_ADDRESS = process.env.BASE_DEPOSIT_TOKEN;

const FLOWER = new ethers.Contract(
  FLOWER_TOKEN_ADDRESS,
  [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)"
  ],
  provider
);

let _decimals = null;
async function getDecimals() {
  if (_decimals !== null) return _decimals;
  _decimals = await FLOWER.decimals();
  return _decimals;
}

async function checkFlowerBalance(address) {
  const [bal, decimals] = await Promise.all([FLOWER.balanceOf(address), getDecimals()]);
  return parseFloat(ethers.formatUnits(bal, decimals));
}

// Sweeps the deposit to treasury, THEN swaps. Previously this went straight
// to processSwap(), which executes the on-chain swap using the TREASURY's
// own existing FLOWER balance — completely decoupled from whether this
// user's deposit had ever moved anywhere. An order could show
// SWAPPED/COMPLETED with a real tx hash while the deposit that was supposed
// to back it sat stranded, unswept, at the user's address. This makes the
// sweep a hard prerequisite: if it fails, we stop — we do not fall through
// to a swap that isn't actually backed by this specific deposit.
async function sweepThenSwap(orderId) {
  await sweepFlowerToTreasuryBase(orderId);
  return processSwap(orderId);
}

async function handleNewDeposit({ addr, newAmount }) {
  const existing = await FlowerOrder.findOne({
    depositAddress: addr.address.toLowerCase(),
    chain:          "BASE",
    status:         { $in: ["WAITING_DEPOSIT", "DEPOSIT_RECEIVED", "VERIFIED", "SWAPPING"] }
  });

  let orderId;
  if (existing) {
    existing.receivedAmount = newAmount;
    existing.status         = "DEPOSIT_RECEIVED";
    await existing.save();
    orderId = existing.orderId;
    console.log(`[BASE LISTENER] Updated order ${orderId} — ${newAmount} FLOWER`);
  } else {
    orderId = "FLW-BASE-" + crypto.randomBytes(6).toString("hex");
    await FlowerOrder.create({
      orderId,
      userId:         addr.userId,
      token:          "FLOWER",
      chain:          "BASE",
      depositAddress: addr.address.toLowerCase(),
      expectedAmount: newAmount,
      receivedAmount: newAmount,
      status:         "DEPOSIT_RECEIVED"
    });
    console.log(`[BASE LISTENER] Created order ${orderId} — ${newAmount} FLOWER from ${addr.address}`);
  }

  // Awaited (not fire-and-forget) so the caller knows whether the sweep
  // actually succeeded before deciding it's safe to advance addr.lastAmount.
  await sweepThenSwap(orderId).catch(err => {
    console.error(`[BASE LISTENER] sweep/swap failed for ${orderId}:`, err.message);
    throw err;
  });
}

export async function startBaseListener() {
  if (!FLOWER_TOKEN_ADDRESS) {
    console.error("[BASE LISTENER] BASE_DEPOSIT_TOKEN not set — not started"); return;
  }
  if (!process.env.BASE_TREASURY_PRIVATE_KEY) {
    console.error("[BASE LISTENER] BASE_TREASURY_PRIVATE_KEY not set — not started"); return;
  }

  console.log("[BASE LISTENER] starting — polling every 15s");

  setInterval(async () => {
    try {
      // FIX: DepositAddress records are created with token:"*" (generic,
      // one address per chain per user — see walletAddressService.js), never
      // token:"FLOWER". This filter matched zero documents, meaning this
      // poller has been running every 15s and finding nothing, ever.
      const addresses = await DepositAddress.find({ chain: "base", status: "active" });
      for (const addr of addresses) {
        try {
          const balance = await checkFlowerBalance(addr.address);
          console.log(`[BASE SCAN] ${addr.address} balance=${balance}`);
          if (balance <= 0)                 continue;
          if (balance === addr.lastAmount)  continue;
          const newAmount = balance - (addr.lastAmount || 0);
          if (newAmount <= 0.001)           continue;

          await handleNewDeposit({ addr, newAmount, balance });

          // The sweep just emptied this address back to (near) zero, so the
          // baseline for the next delta check must reset to the address's
          // actual current balance — NOT the pre-sweep peak. Using the old
          // peak here would make every future deposit compute as a negative
          // delta and be silently ignored forever. Re-read on-chain rather
          // than assume 0, in case a further deposit landed mid-sweep.
          addr.lastAmount = await checkFlowerBalance(addr.address);
          await addr.save();
        } catch (err) {
          console.error(`[BASE LISTENER] error checking ${addr.address}:`, err.message);
        }
      }
    } catch (err) {
      console.error("[BASE LISTENER ERROR]", err.message);
    }
  }, 15000);

  console.log("[BASE LISTENER] running");
}
