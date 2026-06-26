import { ethers } from 'ethers';
import walletService from '../walletService.js';
import Wallet from '../../models/walletModel.js';

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
];

const BASE_PROVIDER   = new ethers.JsonRpcProvider(process.env.BASE_RPC || 'https://mainnet.base.org');
const RONIN_PROVIDER  = new ethers.JsonRpcProvider(process.env.RONIN_RPC || 'https://api.roninchain.com/rpc');

const CHAIN_CONFIG = {
  base: {
    provider:   BASE_PROVIDER,
    privateKey: () => process.env.BASE_TREASURY_PRIVATE_KEY,
    tokens: {
      USDT: process.env.BASE_USDT_TOKEN,
      USDC: process.env.BASE_USDC_TOKEN,
    }
  },
  ronin: {
    provider:   RONIN_PROVIDER,
    privateKey: () => process.env.RONIN_TREASURY_PRIVATE_KEY,
    tokens: {
      USDT: process.env.RONIN_USDT_TOKEN,
      USDC: process.env.RONIN_USDC_TOKEN,
    }
  }
};

async function getUserChainAddress(userId, preferredChain) {
  const wallet = await Wallet.findOne({ userId });
  if (!wallet) throw new Error(`No wallet found for user ${userId}`);

  // Try preferred chain first, fall back to base
  const chains = [preferredChain, 'base', 'ronin'].filter(Boolean);
  for (const chain of chains) {
    const entry = wallet.chainAddresses?.find(
      c => c.chain?.toLowerCase() === chain.toLowerCase()
    );
    if (entry?.address) return { address: entry.address, chain: chain.toLowerCase() };
  }
  throw new Error(`No on-chain address found for user ${userId}`);
}

/**
 * Sends real USDT/USDC on Base or Ronin from treasury to user's wallet.
 * Also credits the user's internal ledger.
 */
export async function sendStablecoinToUser({ userId, amount, currency, txRef, preferChain = 'base' }) {
  if (!userId || !amount || !currency) {
    throw new Error('sendStablecoinToUser: missing required params');
  }

  // 1. Get user address + best chain
  const { address: toAddress, chain } = await getUserChainAddress(userId, preferChain);

  const config = CHAIN_CONFIG[chain];
  if (!config) throw new Error(`Unsupported chain: ${chain}`);

  const tokenAddress = config.tokens[currency];
  if (!tokenAddress) throw new Error(`No ${currency} contract on ${chain}`);

  const privateKey = config.privateKey();
  if (!privateKey) throw new Error(`Treasury private key not set for ${chain}`);

  // 2. Send on-chain
  const treasuryWallet = new ethers.Wallet(privateKey, config.provider);
  const token          = new ethers.Contract(tokenAddress, ERC20_ABI, treasuryWallet);
  const decimals       = await token.decimals();
  const amountWei      = ethers.parseUnits(amount.toString(), decimals);

  console.log(`[treasury] Sending ${amount} ${currency} on ${chain} to ${toAddress} | ref: ${txRef}`);
  const tx      = await token.transfer(toAddress, amountWei);
  const receipt = await tx.wait();
  console.log(`[treasury] ✅ Confirmed | txHash: ${receipt.hash} | chain: ${chain}`);

  // 3. Credit internal ledger
  await walletService.credit(userId, currency, amount, {
    referenceId:     txRef || undefined,
    description:     `Treasury send: ${amount} ${currency} → ${toAddress} on ${chain}`,
    transactionType: 'credit',
  });

  return { success: true, userId, amount, currency, toAddress, chain, txHash: receipt.hash, txRef };
}
