// scripts/check-rpcs.js
//
// Tests each chain's RPC endpoint individually so we can see exactly
// which one is broken, instead of one big silent failure.
//
// Usage:
//   node scripts/check-rpcs.js

import dotenv from 'dotenv';
dotenv.config();

import { ethers } from 'ethers';

const RPCS = {
  ETHEREUM: process.env.ETHEREUM_RPC || 'https://eth.llamarpc.com',
  POLYGON: process.env.POLYGON_RPC || 'https://polygon-rpc.com',
  BASE: process.env.BASE_RPC || 'https://mainnet.base.org',
  RONIN: process.env.RONIN_RPC || 'https://api.roninchain.com/rpc',
};

async function testRpc(name, url) {
  console.log(`\nTesting ${name} -> ${url}`);
  try {
    const provider = new ethers.JsonRpcProvider(url);
    const network = await Promise.race([
      provider.getNetwork(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout after 8s')), 8000)),
    ]);
    console.log(`  OK — chainId=${network.chainId}, name=${network.name}`);
    return true;
  } catch (err) {
    console.log(`  FAILED — ${err.message}`);
    return false;
  }
}

async function main() {
  const results = {};
  for (const [name, url] of Object.entries(RPCS)) {
    results[name] = await testRpc(name, url);
  }
  console.log('\n=== SUMMARY ===');
  for (const [name, ok] of Object.entries(results)) {
    console.log(`${name}: ${ok ? 'OK' : 'FAILED'}`);
  }
  process.exit(0);
}

main();
