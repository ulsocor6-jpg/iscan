// src/services/flowerSweepService.js
// Sweeps FLOWER from user's HD deposit address → treasury wallet.
// Called by watcher after deposit is confirmed (12 blocks).
// Uses hdIndex to re-derive the private key for signing.

import { ethers }             from "ethers";
import FlowerOrder            from "../../models/flower/flowerOrderModel.js";
import DepositAddress         from "../../models/depositAddressModel.js";
import { deriveRoninAddress } from "../hdWalletService.js";
import { ERC20_ABI }          from "../../../config/katana.js";
import flowerConfig           from "../../../config/flower.js";

const { RONIN_RPC, FLOWER_TOKEN, TREASURY_WALLET } = flowerConfig;

export async function sweepFlowerToTreasury(orderId) {
  const order = await FlowerOrder.findOne({ orderId });
  if (!order) throw new Error(`Order not found: ${orderId}`);

  // Get deposit address record (has hdIndex)
  const depositRecord = await DepositAddress.findOne({
    address: order.depositAddress.toLowerCase(),
    chain:   "RONIN"
  });

  if (!depositRecord || depositRecord.hdIndex === null) {
    throw new Error(`No HD index found for address ${order.depositAddress}`);
  }

  // Re-derive private key from mnemonic + index
  const derived = await deriveRoninAddress(depositRecord.hdIndex);
  if (!derived?.privateKey) {
    throw new Error(`Could not derive private key for index ${depositRecord.hdIndex}`);
  }

  const provider     = new ethers.JsonRpcProvider(RONIN_RPC);
  const signer       = new ethers.Wallet(derived.privateKey, provider);
  const flowerToken  = new ethers.Contract(FLOWER_TOKEN, ERC20_ABI, signer);

  // Get full FLOWER balance of deposit address
  const balance  = await flowerToken.balanceOf(order.depositAddress);
  const decimals = await flowerToken.decimals();

  if (balance === 0n) {
    throw new Error(`No FLOWER balance at ${order.depositAddress}`);
  }

  const humanAmount = parseFloat(ethers.formatUnits(balance, decimals));
  console.log(`[FlowerSweep] ${orderId} — sweeping ${humanAmount} FLOWER from ${order.depositAddress} → treasury`);

  // Transfer full balance to treasury
  const tx      = await flowerToken.transfer(TREASURY_WALLET, balance);
  const receipt = await tx.wait();

  console.log(`[FlowerSweep] ${orderId} — sweep complete (tx: ${receipt.hash})`);

  // Update order with actual received amount
  await FlowerOrder.updateOne(
    { orderId },
    {
      receivedAmount: humanAmount,
      status:         "VERIFIED"
    }
  );

  return { txHash: receipt.hash, amount: humanAmount };
}

export default { sweepFlowerToTreasury };
