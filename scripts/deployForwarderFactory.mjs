// scripts/deployForwarderFactory.mjs
//
// Deploys ForwarderFactory to a single chain, using that chain's existing
// treasury wallet as both the deployer and the constructor's treasury
// argument. Run once per chain.
//
// Usage:
//   node scripts/deployForwarderFactory.mjs ronin
//   node scripts/deployForwarderFactory.mjs base
//
// After each run, copy the printed factory address into .env as
// RONIN_FORWARDER_FACTORY or BASE_FORWARDER_FACTORY.
//
// Optional: set RONIN_FORWARDER_TOKENS / BASE_FORWARDER_TOKENS in .env as
// a comma-separated list of ERC-20 addresses (e.g. USDC, FLOWER) that
// sweep() should also forward. If unset, only native currency (RON/ETH)
// is swept until tokens are added later via factory.addToken().

import "dotenv/config";
import { ethers } from "ethers";
import fs from "fs";

const CHAIN_CONFIG = {
  ronin: {
    rpcEnv: "RONIN_RPC",
    privateKeyEnv: "RONIN_TREASURY_PRIVATE_KEY",
    treasuryEnv: "RONIN_TREASURY_WALLET",
    tokensEnv: "RONIN_FORWARDER_TOKENS"
  },
  base: {
    rpcEnv: "BASE_RPC",
    privateKeyEnv: "BASE_TREASURY_PRIVATE_KEY",
    treasuryEnv: "BASE_TREASURY_WALLET",
    tokensEnv: "BASE_FORWARDER_TOKENS"
  }
};

async function main() {
  const chainArg = (process.argv[2] || "").toLowerCase();
  const cfg = CHAIN_CONFIG[chainArg];

  if (!cfg) {
    console.error(`Usage: node scripts/deployForwarderFactory.mjs <ronin|base>`);
    process.exit(1);
  }

  const rpcUrl = process.env[cfg.rpcEnv];
  const privateKey = process.env[cfg.privateKeyEnv];
  const treasury = process.env[cfg.treasuryEnv];

  if (!rpcUrl) throw new Error(`${cfg.rpcEnv} is not set in .env`);
  if (!privateKey) throw new Error(`${cfg.privateKeyEnv} is not set in .env`);
  if (!treasury) throw new Error(`${cfg.treasuryEnv} is not set in .env`);

  const artifact = JSON.parse(
    fs.readFileSync(
      new URL("../artifacts/contracts/ForwarderFactory.sol/ForwarderFactory.json", import.meta.url)
    )
  );

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const deployer = new ethers.Wallet(privateKey, provider);

  console.log(`Deploying ForwarderFactory to ${chainArg.toUpperCase()}...`);
  console.log(`  Deployer/treasury: ${treasury}`);

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
  const contract = await factory.deploy(treasury);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`\n✅ ForwarderFactory deployed at: ${address}`);
  console.log(`\nAdd this to .env:`);
  console.log(`${chainArg.toUpperCase()}_FORWARDER_FACTORY=${address}`);

  const tokensRaw = process.env[cfg.tokensEnv];
  if (tokensRaw) {
    const tokens = tokensRaw.split(",").map((t) => t.trim()).filter(Boolean);
    console.log(`\nRegistering ${tokens.length} token(s) from ${cfg.tokensEnv}...`);
    for (const token of tokens) {
      const tx = await contract.addToken(token);
      await tx.wait();
      console.log(`  ✓ added ${token}`);
    }
  } else {
    console.log(
      `\nNo ${cfg.tokensEnv} set — factory will only sweep native currency for now. ` +
      `Add ERC-20 tokens later by calling factory.addToken(address) as the owner.`
    );
  }
}

main().catch((err) => {
  console.error("Deploy failed:", err.message);
  process.exit(1);
});
