// src/services/treasury/stablecoinSweepService.js
//
// Sweeps USDC/USDT from a user's HD-derived address -> treasury wallet,
// on Base or Ronin. Modeled directly on the working flowerSweepService.js
// pattern: re-derive the private key from walletIndex, read on-chain
// balance, transfer the full amount to treasury.
//
// This is the inbound leg that was missing — sendStablecoinToUser already
// handles treasury -> user (outbound); this handles user -> treasury (inbound).

import { ethers } from 'ethers';
import { deriveRoninAddress, deriveBaseAddress } from '../hdWalletService.js';

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

const CHAIN_CONFIG = {
  base: {
    rpcUrl: () => process.env.BASE_RPC || 'https://mainnet.base.org',
    treasuryWallet: () => process.env.BASE_TREASURY_WALLET,
    treasuryPrivateKey: () => process.env.BASE_TREASURY_PRIVATE_KEY,
    deriveAddress: deriveBaseAddress,
    tokens: () => ({
      USDC: process.env.BASE_USDC_TOKEN || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      USDT: process.env.BASE_USDT_TOKEN,
    }),
  },
  ronin: {
    rpcUrl: () => process.env.RONIN_RPC || 'https://api.roninchain.com/rpc',
    treasuryWallet: () => process.env.TREASURY_WALLET || process.env.RONIN_TREASURY_WALLET,
    treasuryPrivateKey: () => process.env.RONIN_TREASURY_PRIVATE_KEY,
    deriveAddress: deriveRoninAddress,
    tokens: () => ({
      USDC: process.env.USDC_TOKEN || '0x0b7007c13325c48911f73a2dad5fa5dcbf808adc',
      USDT: process.env.RONIN_USDT_TOKEN || '0x1c84981f3b05dde0a2ab8e3a78bc3a32a0564cb4',
    }),
  },
};

/**
 * Sweep the full USDC/USDT balance from a user's HD wallet on a given
 * chain to the treasury wallet for that chain.
 *
 * @param {string} chain - 'base' | 'ronin'
 * @param {string} token - 'USDC' | 'USDT'
 * @param {number} walletIndex - the user's HD derivation index (Wallet.walletIndex)
 * @returns {{ swept: number, txHash: string|null, fromAddress: string }}
 */
const GAS_UNITS = 100_000n; // ERC20 transfer ~65k gas, padded for safety
const GAS_BUFFER_PCT = 130n; // 1.3x current estimate, to survive price movement before execution

async function ensureGasForSweep({ chain, provider, config, derivedAddress }) {
  const nativeBalance = await provider.getBalance(derivedAddress);

  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas;
  if (!gasPrice) {
    console.error(`[SWEEP] Could not fetch gas price on ${chain} \u2014 skipping gas check, sweep may fail`);
    return { funded: false };
  }

  const requiredWei = (gasPrice * GAS_UNITS * GAS_BUFFER_PCT) / 100n;
  if (nativeBalance >= requiredWei) {
    return { funded: false };
  }

  const privateKey = config.treasuryPrivateKey();
  if (!privateKey) {
    throw new Error(`No treasury private key configured for ${chain} \u2014 cannot fund gas for sweep`);
  }

  const treasurySigner = new ethers.Wallet(privateKey, provider);
  const topUpWei = requiredWei - nativeBalance;

  console.log(`[SWEEP] Funding gas: sending ${ethers.formatEther(topUpWei)} native to ${derivedAddress} on ${chain}`);
  const fundTx = await treasurySigner.sendTransaction({ to: derivedAddress, value: topUpWei });
  await fundTx.wait();
  console.log(`[SWEEP] Gas funded \u2014 tx: ${fundTx.hash}`);

  return { funded: true, amount: ethers.formatEther(topUpWei), txHash: fundTx.hash };
}

export async function sweepStablecoinToTreasury({ chain, token, walletIndex, amount = null }) {
  const config = CHAIN_CONFIG[chain?.toLowerCase()];
  if (!config) throw new Error(`Unsupported sweep chain: ${chain}`);

  const tokenAddress = config.tokens()[token];
  if (!tokenAddress) throw new Error(`No ${token} contract configured on ${chain}`);

  const treasuryAddress = config.treasuryWallet();
  if (!treasuryAddress) throw new Error(`No treasury wallet configured for ${chain}`);

  const derived = await config.deriveAddress(walletIndex);
  if (!derived?.privateKey) {
    throw new Error(`Could not derive private key for walletIndex ${walletIndex} on ${chain}`);
  }

  const provider = new ethers.JsonRpcProvider(config.rpcUrl());
  const signer = new ethers.Wallet(derived.privateKey, provider);
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

  const [onChainBalance, decimals] = await Promise.all([
    contract.balanceOf(derived.address),
    contract.decimals(),
  ]);

  if (onChainBalance === 0n) {
    return { swept: 0, txHash: null, fromAddress: derived.address };
  }

  // `amount` lets a caller sweep only part of the on-chain balance (e.g. a
  // partial USDC->PHP swap) instead of always pulling everything the user
  // holds. Defaults to sweeping the full balance when omitted, preserving
  // the original behavior for callers that intentionally want a full sweep
  // (e.g. treasury cleanup tooling).
  let sweepAmount = onChainBalance;
  if (amount !== null) {
    const requested = ethers.parseUnits(amount.toString(), decimals);
    if (requested > onChainBalance) {
      throw new Error(
        `Requested sweep amount ${amount} ${token} exceeds on-chain balance ` +
        `${ethers.formatUnits(onChainBalance, decimals)} ${token} for ${derived.address}`
      );
    }
    sweepAmount = requested;
  }

  await ensureGasForSweep({ chain, provider, config, derivedAddress: derived.address });

  const humanAmount = parseFloat(ethers.formatUnits(sweepAmount, decimals));
  console.log(`[SWEEP] ${humanAmount} ${token} on ${chain} from ${derived.address} -> treasury ${treasuryAddress}`);

  const tx = await contract.transfer(treasuryAddress, sweepAmount);
  const receipt = await tx.wait();

  console.log(`[SWEEP] complete — tx: ${receipt.hash}`);

  return { swept: humanAmount, txHash: receipt.hash, fromAddress: derived.address };
}
