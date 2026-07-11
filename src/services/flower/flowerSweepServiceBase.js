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
import fs                   from "fs";
import FlowerOrder          from "../../models/flower/flowerOrderModel.js";
import DepositAddress       from "../../models/depositAddressModel.js";
import { deriveBaseAddress, indexToSalt } from "../hdWalletService.js";
import { ERC20_ABI }        from "../../../config/katana.js"; // generic ERC20 ABI (transfer/balanceOf/decimals) — not Ronin-specific
import inspector            from "../blockchain/inspector/blockchainInspector.js";
import { withTreasuryLock } from "../treasury/treasurySendQueue.js";

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

  inspector.info("swap", `Sweep starting for ${orderId}`, {
    orderId, userId: String(order.userId), chain: "BASE", step: "sweep_start"
  });

  const logAndThrow = (msg) => {
    inspector.error("swap", msg, {
      orderId, userId: String(order.userId), chain: "BASE", step: "sweep_pre_transfer_failure"
    });
    throw new Error(msg);
  };

  const expected = order.receivedAmount;
  if (!expected || expected <= 0) {
    return logAndThrow(`Order ${orderId} has no receivedAmount to sweep`);
  }

  const depositRecord = await DepositAddress.findOne({
    address: order.depositAddress.toLowerCase(),
    chain:   "base"
  });
  if (!depositRecord || depositRecord.hdIndex == null) {
    return logAndThrow(`No HD index found for address ${order.depositAddress}`);
  }

  // Forwarder-contract addresses have no private key \u2014 sweeping means
  // calling the factory's deploy()/sweep(), not signing a transfer from
  // the deposit address itself. Branch here and return early; the rest
  // of this function (private key derivation, gas pre-funding, direct
  // ERC20 transfer) is the legacy EOA path and applies only when
  // addressType is 'EOA' or unset (all pre-migration addresses).
  if (depositRecord.addressType === "FORWARDER") {
    return sweepViaForwarderBase({ order, depositRecord, orderId });
  }

  const derived = await deriveBaseAddress(depositRecord.hdIndex);
  if (!derived?.privateKey) {
    return logAndThrow(`Could not derive private key for index ${depositRecord.hdIndex}`);
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

  // Deposit addresses are freshly derived and only ever receive FLOWER —
  // they hold zero native ETH, so the sweep transaction itself can't pay
  // gas. Top up just enough ETH from treasury before attempting the sweep.
  const GAS_LIMIT_ESTIMATE = 65000n; // ERC20 transfer, generous margin
  const gasPrice = (await provider.getFeeData()).gasPrice ?? ethers.parseUnits("0.01", "gwei");
  const requiredGasWei = GAS_LIMIT_ESTIMATE * gasPrice * 2n; // 2x buffer for price fluctuation

  const currentEthBalance = await provider.getBalance(order.depositAddress);
  if (currentEthBalance < requiredGasWei) {
    if (!process.env.BASE_TREASURY_PRIVATE_KEY) {
      throw new Error("BASE_TREASURY_PRIVATE_KEY not set — cannot fund gas for sweep");
    }
    const topUpAmount = requiredGasWei - currentEthBalance;
    const treasurySigner = new ethers.Wallet(process.env.BASE_TREASURY_PRIVATE_KEY, provider);

    inspector.info("swap", `Funding gas for sweep of ${orderId}`, {
      orderId, userId: String(order.userId), chain: "BASE", step: "gas_funding_start",
      amount: ethers.formatEther(topUpAmount)
    });

    console.log(`[FlowerSweepBase] ${orderId} — funding ${ethers.formatEther(topUpAmount)} ETH gas to ${order.depositAddress}`);
    const fundTx = await withTreasuryLock("BASE", async () => {
      const sentTx = await treasurySigner.sendTransaction({
        to: order.depositAddress,
        value: topUpAmount
      });
      return sentTx.wait();
    });
    console.log(`[FlowerSweepBase] ${orderId} — gas funded (tx: ${fundTx.hash})`);

    inspector.success("swap", `Gas funded for ${orderId}`, {
      orderId, userId: String(order.userId), chain: "BASE", step: "gas_funding_complete",
      txHash: fundTx.hash
    });
  }

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

  let tx, receipt;
  try {
    tx      = await flowerToken.transfer(treasuryAddress, amountWei);
    receipt = await tx.wait();
  } catch (err) {
    // A transfer may already be broadcast/pending at this point — this is NOT
    // safe to auto-fail (see flowerUsdtSwapService.js's catch handler), unlike
    // the validation errors above where nothing was ever sent on-chain.
    err.stage = "post-transfer";
    inspector.error("swap", `Sweep transfer failed for ${orderId}: ${err.message}`, {
      orderId, userId: String(order.userId), chain: "BASE", step: "sweep_post_transfer_failure"
    });
    throw err;
  }

  console.log(`[FlowerSweepBase] ${orderId} — sweep complete (tx: ${receipt.hash})`);

  await FlowerOrder.updateOne(
    { orderId },
    { status: "VERIFIED", sweepTxHash: receipt.hash }
  );

  inspector.success("swap", `Sweep complete for ${orderId}`, {
    orderId, userId: String(order.userId), chain: "BASE", step: "sweep_complete",
    txHash: receipt.hash, amount: expected
  });

  return { txHash: receipt.hash, amount: expected };
}

async function sweepViaForwarderBase({ order, depositRecord, orderId }) {
  const provider = new ethers.JsonRpcProvider(BASE_RPC);
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

  if (!process.env.BASE_FORWARDER_FACTORY) {
    throw new Error("BASE_FORWARDER_FACTORY is not set");
  }
  if (!process.env.BASE_TREASURY_PRIVATE_KEY) {
    throw new Error("BASE_TREASURY_PRIVATE_KEY is not set \u2014 cannot pay gas for forwarder sweep");
  }

  const artifact = JSON.parse(
    fs.readFileSync(
      new URL("../../../artifacts/contracts/ForwarderFactory.sol/ForwarderFactory.json", import.meta.url)
    )
  );

  const operator = new ethers.Wallet(process.env.BASE_TREASURY_PRIVATE_KEY, provider);
  const factory  = new ethers.Contract(process.env.BASE_FORWARDER_FACTORY, artifact.abi, operator);
  const salt     = indexToSalt(depositRecord.hdIndex);

  inspector.info("swap", `Forwarder sweep starting for ${orderId}`, {
    orderId, userId: String(order.userId), chain: "BASE", step: "sweep_start", addressType: "FORWARDER"
  });
  console.log(`[FlowerSweepBase] ${orderId} \u2014 sweeping via forwarder factory.deploy() (hdIndex ${depositRecord.hdIndex})`);

  const receipt = await withTreasuryLock("BASE", async () => {
    const tx = await factory.deploy(salt);
    return tx.wait();
  });

  console.log(`[FlowerSweepBase] ${orderId} \u2014 forwarder sweep complete (tx: ${receipt.hash})`);

  await FlowerOrder.updateOne(
    { orderId },
    { status: "VERIFIED", sweepTxHash: receipt.hash }
  );

  inspector.success("swap", `Sweep complete for ${orderId} (forwarder)`, {
    orderId, userId: String(order.userId), chain: "BASE", step: "sweep_complete",
    txHash: receipt.hash, amount: order.receivedAmount
  });

  return { txHash: receipt.hash, amount: order.receivedAmount };
}

export default { sweepFlowerToTreasuryBase };
