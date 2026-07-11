// src/services/flowerSweepService.js
// Sweeps FLOWER from user's HD deposit address → treasury wallet.
// Called by watcher after deposit is confirmed (12 blocks).
// Uses hdIndex to re-derive the private key for signing.
//
// IMPORTANT: sweeps ONLY order.receivedAmount (the amount the watcher
// actually matched to a specific on-chain Transfer for this order) — never
// the address's full current balance. Deposit addresses are reused across
// every order a user creates, so the address may be holding a leftover
// balance that belongs to a different, still-pending order. Sweeping
// "whatever is there" silently reattributes that other order's funds to
// this one (and leaves the other order to fail with "no balance found"
// even though the user really did deposit).
//
// If the on-chain balance is short of what's expected, we refuse to sweep
// rather than pass the shortfall on as if it were a real, verified deposit.

import { ethers }             from "ethers";
import fs                     from "fs";
import FlowerOrder            from "../../models/flower/flowerOrderModel.js";
import DepositAddress         from "../../models/depositAddressModel.js";
import { deriveRoninAddress, indexToSalt } from "../hdWalletService.js";
import { ERC20_ABI }          from "../../../config/katana.js";
import flowerConfig           from "../../../config/flower.js";
import { withTreasuryLock } from "../treasury/treasurySendQueue.js";

const { RONIN_RPC, FLOWER_TOKEN, TREASURY_WALLET } = flowerConfig;

export async function sweepFlowerToTreasury(orderId) {
  const order = await FlowerOrder.findOne({ orderId });
  if (!order) throw new Error(`Order not found: ${orderId}`);

  const expected = order.receivedAmount;
  if (!expected || expected <= 0) {
    throw new Error(`Order ${orderId} has no receivedAmount to sweep`);
  }

  // Get deposit address record (has hdIndex)
  const depositRecord = await DepositAddress.findOne({
    address: order.depositAddress.toLowerCase(),
    chain:   "RONIN"
  });

  if (!depositRecord || depositRecord.hdIndex === null) {
    throw new Error(`No HD index found for address ${order.depositAddress}`);
  }

  // Forwarder-contract addresses have no private key \u2014 sweeping means
  // calling the factory's deploy()/sweep(), not signing a transfer from
  // the deposit address itself. Branch here and return early; the rest
  // of this function (private key derivation, direct ERC20 transfer) is
  // the legacy EOA path and applies only when addressType is 'EOA' or
  // unset (all pre-migration addresses).
  if (depositRecord.addressType === "FORWARDER") {
    return sweepViaForwarderRonin({ order, depositRecord, orderId });
  }

  // Re-derive private key from mnemonic + index
  const derived = await deriveRoninAddress(depositRecord.hdIndex);
  if (!derived?.privateKey) {
    throw new Error(`Could not derive private key for index ${depositRecord.hdIndex}`);
  }

  // Safety check: the re-derived address must match the address on file.
  // If it doesn't, the HD index/derivation is out of sync with reality —
  // signing anyway would attempt to spend from the wrong address entirely.
  // Refuse rather than guess.
  if (derived.address.toLowerCase() !== order.depositAddress.toLowerCase()) {
    throw new Error(
      `HD derivation mismatch for order ${orderId}: stored address=${order.depositAddress}, ` +
      `re-derived address for index ${depositRecord.hdIndex}=${derived.address}. Refusing to sweep.`
    );
  }

  const provider     = new ethers.JsonRpcProvider(RONIN_RPC);
  const signer       = new ethers.Wallet(derived.privateKey, provider);
  const flowerToken  = new ethers.Contract(FLOWER_TOKEN, ERC20_ABI, signer);

  const decimals   = await flowerToken.decimals();
  const balance    = await flowerToken.balanceOf(order.depositAddress);
  const amountWei  = ethers.parseUnits(expected.toString(), decimals);

  if (balance < amountWei) {
    throw new Error(
      `Address ${order.depositAddress} balance ` +
      `(${ethers.formatUnits(balance, decimals)} FLOWER) is less than order ${orderId}'s ` +
      `expected ${expected} FLOWER — refusing to sweep a short amount`
    );
  }

  console.log(
    `[FlowerSweep] ${orderId} — sweeping ${expected} FLOWER (of ${ethers.formatUnits(balance, decimals)} ` +
    `available) from ${order.depositAddress} → treasury`
  );

  // Transfer exactly what this order is owed — not the full balance.
  const tx      = await flowerToken.transfer(TREASURY_WALLET, amountWei);
  const receipt = await tx.wait();

  console.log(`[FlowerSweep] ${orderId} — sweep complete (tx: ${receipt.hash})`);

  await FlowerOrder.updateOne(
    { orderId },
    {
      status:      "VERIFIED",
      sweepTxHash: receipt.hash
      // receivedAmount is intentionally left as-is — it already reflects
      // the specific deposit this order was matched to. We do not
      // overwrite it with whatever balance happened to be swept.
    }
  );

  return { txHash: receipt.hash, amount: expected };
}

async function sweepViaForwarderRonin({ order, depositRecord, orderId }) {
  const provider = new ethers.JsonRpcProvider(RONIN_RPC);
  const flowerTokenReadOnly = new ethers.Contract(FLOWER_TOKEN, ERC20_ABI, provider);

  const decimals  = await flowerTokenReadOnly.decimals();
  const balance   = await flowerTokenReadOnly.balanceOf(order.depositAddress);
  const amountWei = ethers.parseUnits(order.receivedAmount.toString(), decimals);

  if (balance < amountWei) {
    throw new Error(
      `Address ${order.depositAddress} balance ` +
      `(${ethers.formatUnits(balance, decimals)} FLOWER) is less than order ${orderId}'s ` +
      `expected ${order.receivedAmount} FLOWER \u2014 refusing to sweep a short amount`
    );
  }

  if (!process.env.RONIN_FORWARDER_FACTORY) {
    throw new Error("RONIN_FORWARDER_FACTORY is not set");
  }
  if (!process.env.RONIN_TREASURY_PRIVATE_KEY) {
    throw new Error("RONIN_TREASURY_PRIVATE_KEY is not set \u2014 cannot pay gas for forwarder sweep");
  }

  const artifact = JSON.parse(
    fs.readFileSync(
      new URL("../../../artifacts/contracts/ForwarderFactory.sol/ForwarderFactory.json", import.meta.url)
    )
  );

  const operator = new ethers.Wallet(process.env.RONIN_TREASURY_PRIVATE_KEY, provider);
  const factory  = new ethers.Contract(process.env.RONIN_FORWARDER_FACTORY, artifact.abi, operator);
  const salt     = indexToSalt(depositRecord.hdIndex);

  console.log(`[FlowerSweep] ${orderId} \u2014 sweeping via forwarder factory.deploy() (hdIndex ${depositRecord.hdIndex})`);

  const receipt = await withTreasuryLock("RONIN", async () => {
    const tx = await factory.deploy(salt);
    return tx.wait();
  });

  console.log(`[FlowerSweep] ${orderId} \u2014 forwarder sweep complete (tx: ${receipt.hash})`);

  await FlowerOrder.updateOne(
    { orderId },
    { status: "VERIFIED", sweepTxHash: receipt.hash }
  );

  return { txHash: receipt.hash, amount: order.receivedAmount };
}

export default { sweepFlowerToTreasury };
