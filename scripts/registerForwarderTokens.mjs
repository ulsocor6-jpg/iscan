// scripts/registerForwarderTokens.mjs
//
// Calls addToken() on an already-deployed ForwarderFactory for every
// address listed in RONIN_FORWARDER_TOKENS / BASE_FORWARDER_TOKENS.
// Safe to re-run — the contract's own addToken() rejects duplicates,
// and this script skips ones it already knows are registered by
// reading tokenCount()/tokenAt() first rather than blindly retrying.
//
// Usage:
//   node scripts/registerForwarderTokens.mjs ronin
//   node scripts/registerForwarderTokens.mjs base

import "dotenv/config";
import { ethers } from "ethers";
import fs from "fs";

const CHAIN_CONFIG = {
  ronin: {
    rpcEnv: "RONIN_RPC",
    privateKeyEnv: "RONIN_TREASURY_PRIVATE_KEY",
    factoryEnv: "RONIN_FORWARDER_FACTORY",
    tokensEnv: "RONIN_FORWARDER_TOKENS"
  },
  base: {
    rpcEnv: "BASE_RPC",
    privateKeyEnv: "BASE_TREASURY_PRIVATE_KEY",
    factoryEnv: "BASE_FORWARDER_FACTORY",
    tokensEnv: "BASE_FORWARDER_TOKENS"
  }
};

async function main() {
  const chainArg = (process.argv[2] || "").toLowerCase();
  const cfg = CHAIN_CONFIG[chainArg];

  if (!cfg) {
    console.error(`Usage: node scripts/registerForwarderTokens.mjs <ronin|base>`);
    process.exit(1);
  }

  const rpcUrl = process.env[cfg.rpcEnv];
  const privateKey = process.env[cfg.privateKeyEnv];
  const factoryAddress = process.env[cfg.factoryEnv];
  const tokensRaw = process.env[cfg.tokensEnv];

  if (!rpcUrl) throw new Error(`${cfg.rpcEnv} is not set in .env`);
  if (!privateKey) throw new Error(`${cfg.privateKeyEnv} is not set in .env`);
  if (!factoryAddress) throw new Error(`${cfg.factoryEnv} is not set in .env`);
  if (!tokensRaw) throw new Error(`${cfg.tokensEnv} is not set in .env`);

  const tokens = tokensRaw.split(",").map((t) => t.trim()).filter(Boolean);

  const artifact = JSON.parse(
    fs.readFileSync(
      new URL("../artifacts/contracts/ForwarderFactory.sol/ForwarderFactory.json", import.meta.url)
    )
  );

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const owner = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(factoryAddress, artifact.abi, owner);

  console.log(`Registering tokens on ${chainArg.toUpperCase()} factory ${factoryAddress}...`);

  const count = Number(await contract.tokenCount());
  const existing = new Set();
  for (let i = 0; i < count; i++) {
    existing.add((await contract.tokenAt(i)).toLowerCase());
  }

  for (const token of tokens) {
    if (existing.has(token.toLowerCase())) {
      console.log(`  - ${token} already registered, skipping`);
      continue;
    }
    const tx = await contract.addToken(token);
    await tx.wait();
    console.log(`  ✓ added ${token}`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Registration failed:", err.message);
  process.exit(1);
});
