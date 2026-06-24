// src/services/blockchain/baseListener.js
import { ethers }      from "ethers";
import crypto          from "crypto";
import DepositAddress  from "../../models/depositAddressModel.js";
import FlowerOrder     from "../../models/flower/flowerOrderModel.js";
import { processSwap } from "../flowerSwapServiceBase.js";

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

async function handleNewDeposit({ addr, newAmount, balance }) {
  const existing = await FlowerOrder.findOne({
    depositAddress: addr.address.toLowerCase(),
    chain:          "BASE",
    status:         { $in: ["WAITING_DEPOSIT", "DEPOSIT_RECEIVED", "VERIFIED", "SWAPPING"] }
  });

  if (existing) {
    existing.receivedAmount = newAmount;
    existing.status         = "DEPOSIT_RECEIVED";
    await existing.save();
    console.log(`[BASE LISTENER] Updated order ${existing.orderId} — ${newAmount} FLOWER`);
    processSwap(existing.orderId).catch(err =>
      console.error(`[BASE LISTENER] processSwap failed for ${existing.orderId}:`, err.message)
    );
    return;
  }

  const orderId = "FLW-BASE-" + crypto.randomBytes(6).toString("hex");
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
  processSwap(orderId).catch(err =>
    console.error(`[BASE LISTENER] processSwap failed for ${orderId}:`, err.message)
  );
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
      const addresses = await DepositAddress.find({ chain:"base", token:"FLOWER", status:"active" });
      for (const addr of addresses) {
        try {
          const balance = await checkFlowerBalance(addr.address);
          console.log(`[BASE SCAN] ${addr.address} balance=${balance}`);
          if (balance <= 0)                 continue;
          if (balance === addr.lastAmount)  continue;
          const newAmount = balance - (addr.lastAmount || 0);
          if (newAmount <= 0.001)           continue;
          await handleNewDeposit({ addr, newAmount, balance });
          addr.lastAmount = balance;
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
