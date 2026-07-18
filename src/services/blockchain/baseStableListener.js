// src/services/blockchain/baseStableListener.js
// Watches Base chain deposit addresses for USDC/USDT deposits.
// Detection only. The deposit pipeline is responsible for sweeping,
// crediting balances, and settlement.

import { ethers } from "ethers";
import DepositAddress from "../../models/depositAddressModel.js";
import { createDetectedDeposit } from "../cryptoDepositPipeline.js";
import inspector from "./inspector/blockchainInspector.js";

const ERC20_ABI = [
  "event Transfer(address indexed from,address indexed to,uint256 value)"
];

const TRANSFER_TOPIC = ethers.id(
  "Transfer(address,address,uint256)"
);

const TRANSFER_IFACE = new ethers.Interface(ERC20_ABI);

const TOKEN_DECIMALS = {
  USDC: 6,
  USDT: 6,
};

const BASE_RPC =
  process.env.BASE_RPC ||
  "https://mainnet.base.org";

const TOKENS = {
  USDC:
    process.env.BASE_USDC_TOKEN ||
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",

  USDT:
    process.env.BASE_USDT_TOKEN ||
    "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
};

const provider = new ethers.JsonRpcProvider(BASE_RPC);

const LOOKBACK_BLOCKS = 150;

const lastScannedBlock = {
  USDC: null,
  USDT: null,
};

async function scanToken(
  symbol,
  tokenAddress,
  addresses
) {
  const addrByLower = new Map(
    addresses.map((a) => [
      a.address.toLowerCase(),
      a,
    ])
  );

  const paddedAddresses = addresses.map((a) =>
    ethers.zeroPadValue(a.address, 32)
  );

  const decimals =
    TOKEN_DECIMALS[symbol] || 6;

  const latest =
    await provider.getBlockNumber();

  const fromBlock =
    lastScannedBlock[symbol] !== null
      ? Math.min(
          lastScannedBlock[symbol] + 1,
          latest - LOOKBACK_BLOCKS
        )
      : Math.max(
          latest - LOOKBACK_BLOCKS,
          0
        );

  const logs = await provider.getLogs({
    address: tokenAddress,
    topics: [
      TRANSFER_TOPIC,
      null,
      paddedAddresses,
    ],
    fromBlock,
    toBlock: latest,
  });

  lastScannedBlock[symbol] = latest;

  if (logs.length === 0) {
    console.log(
      `[BASE STABLE] ${symbol} blocks ${fromBlock}-${latest}, ${addresses.length} addresses watched, 0 hits`
    );
    return;
  }

  for (const log of logs) {
    let parsed;

    try {
      parsed =
        TRANSFER_IFACE.parseLog(log);
    } catch {
      continue;
    }

    const toAddr =
      parsed.args.to.toLowerCase();

    const addr =
      addrByLower.get(toAddr);

    if (!addr) continue;

    const amount = parseFloat(
      ethers.formatUnits(
        parsed.args.value,
        decimals
      )
    );

    if (amount < 0.01) continue;

    console.log(
      `[BASE STABLE] Detected ${amount} ${symbol} at ${addr.address} tx=${log.transactionHash}`
    );
    inspector.info("deposit", `Detected ${amount} ${symbol} at ${addr.address}`, {
      orderId: log.transactionHash,
      userId: addr.userId,
      token: symbol,
      amount,
      chain: "base",
      step: "detect",
    });

    try {
      const result =
        await createDetectedDeposit({
          userId: addr.userId,
          token: symbol,
          amount,
          txHash: log.transactionHash,
          address: addr.address,
          chain: "base",
        });

      if (!result) {
        console.log(
          `[BASE STABLE] Duplicate transaction ignored ${log.transactionHash}`
        );
        inspector.info("deposit", `Duplicate transaction ignored`, {
          orderId: log.transactionHash,
          userId: addr.userId,
          token: symbol,
          chain: "base",
          step: "detect",
        });
      }
    } catch (err) {
      console.error(
        `[BASE STABLE] Failed processing ${log.transactionHash}:`,
        err.message
      );
      inspector.error("deposit", `Failed processing deposit tx ${log.transactionHash}: ${err.message}`, {
        orderId: log.transactionHash,
        userId: addr.userId,
        token: symbol,
        amount,
        chain: "base",
        step: "detect",
      });
    }
  }
}

export async function startBaseStableListener() {
  console.log(
    "[BASE STABLE] Starting Base USDC/USDT listener"
  );

  setInterval(async () => {
    try {
      const addresses =
        await DepositAddress.find({
          chain: "base",
          token: {
            $in: [
              "USDC",
              "USDT",
              "*",
            ],
          },
          status: "active",
        });

      if (!addresses.length) return;

      for (const [
        symbol,
        tokenAddress,
      ] of Object.entries(TOKENS)) {
        try {
          await scanToken(
            symbol,
            tokenAddress,
            addresses
          );
        } catch (err) {
          console.error(
            `[BASE STABLE] ${symbol}:`,
            err.message
          );
          inspector.error("deposit", `Base stable scan failed for ${symbol}: ${err.message}`, {
            symbol, chain: "base", step: "scan",
          });
        }
      }
    } catch (err) {
      console.error(
        "[BASE STABLE]",
        err.message
      );
      inspector.error("deposit", `Base stable listener watch loop failed: ${err.message}`, {
        chain: "base", step: "watch-loop",
      });
    }
  }, 30000);
}
