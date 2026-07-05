// src/services/flower/flowerSweepServiceBase.js
// Sweeps FLOWER from a user's Base HD deposit address → Base treasury wallet.
//
// This did not exist before. Base FLOWER deposits sat at the user's personal
// deposit address indefinitely; processSwap() (flowerSwapServiceBase.js)
// executed the on-chain Uniswap swap using the TREASURY's own pre-existing
// FLOWER balance, completely decoupled from whether this specific user's
// deposit had ever moved anywhere. An order could show SWAPPED/COMPLETED
// with a real, valid tx hash while the deposit that was supposed to back it
// remained stranded, unswept, at the user's address.
//
// Mirrors flowerSweepService.js (Ronin): sweeps ONLY order.receivedAmount,
// never the address's full balance, since the address is reused across
// every order the user creates.

import { ethers }           from "ethers";
import FlowerOrder          from "../../models/flower/flowerOrderModel.js";
import DepositAddress       from "../../models/depositAddressModel.js";
import { deriveBaseAddress } from "../hdWalletService.js";
import { ERC20_ABI }        from "../../../config/katana.js"; // generic ERC20 ABI (transfer/balanceOf/decimals) — not Ronin-specific

const BASE_RPC      = process.env.BASE_RPC || "https://mainnet.base.org";
const FLOWER_TOKEN  = process.env.BASE_DEPOSIT_TOKEN;

function getTreasuryAddress() {
  if (!process.env.BASE_TREASURY_PRIVATE_KEY) {
    throw new Error("BASE_TREASURY_PRIVATE_KEY is not set");
  }
  // The treasury address is whatever BASE_TREASURY_PRIVATE_KEY derives to —
  // this is the same address flowerSwapServiceBase.js swaps from.
  return new ethers.Wallet(process.env.BASE_TREASURY_PRIVATE_KEY).address;
}

export async function sweepFlowerToTreasuryBase(orderId) {
  if (!FLOWER_TOKEN) throw new Error("BASE_DEPOSIT_TOKEN is not set");

  const order = await FlowerOrder.findOne({ orderId });
  if (!order) throw new Error(`Order not found: ${orderId}`);

  const expected = order.receivedAmount;
  if (!expected || expected <= 0) {
    throw new Error(`Order ${orderId} has no receivedAmount to sweep`);
  }

  const depositRecord = await DepositAddress.findOne({
    address: order.depositAddress.toLowerCase(),
    chain:   "base"
  });
  if (!depositRecord || depositRecord.hdIndex == null) {
    throw new Error(`No HD index found for address ${order.depositAddress}`);
  }

  const derived = await deriveBaseAddress(depositRecord.hdIndex);
  if (!derived?.privateKey) {
    throw new Error(`Could not derive private key for index ${depositRecord.hdIndex}`);
  }

  if (derived.address.toLowerCase() !== order.depositAddress.toLowerCase()) {
    throw new Error(
      `HD derivation mismatch for order ${orderId}: stored address=${order.depositAddress}, ` +
      `re-derived address for index ${depositRecord.hdIndex}=${derived.address}. Refusing to sweep.`
    );
  }

  const provider    = new ethers.JsonRpcProvider(BASE_RPC);
  const signer      = new ethers.Wallet(derived.privateKey, provider);
  const flowerToken = new ethers.Contract(FLOWER_TOKEN, ERC20_ABI, signer);

  const decimals  = await flowerToken.decimals();
  const balance   = await flowerToken.balanceOf(order.depositAddress);
  const amountWei = ethers.parseUnits(expected.toString(), decimals);

  if (balance < amountWei) {
    throw new Error(
      `Address ${order.depositAddress} balance ` +
      `(${ethers.formatUnits(balance, decimals)} FLOWER) is less than order ${orderId}'s ` +
      `expected ${expected} FLOWER — refusing to sweep a short amount`
    );
  }

  const treasuryAddress = getTreasuryAddress();

  console.log(
    `[FlowerSweepBase] ${orderId} — sweeping ${expected} FLOWER (of ${ethers.formatUnits(balance, decimals)} ` +
    `available) from ${order.depositAddress} → treasury`
  );

  const tx      = await flowerToken.transfer(treasuryAddress, amountWei);
  const receipt = await tx.wait();

  console.log(`[FlowerSweepBase] ${orderId} — sweep complete (tx: ${receipt.hash})`);

  await FlowerOrder.updateOne(
    { orderId },
    { status: "VERIFIED", sweepTxHash: receipt.hash }
  );

  return { txHash: receipt.hash, amount: expected };
}

export default { sweepFlowerToTreasuryBase };
