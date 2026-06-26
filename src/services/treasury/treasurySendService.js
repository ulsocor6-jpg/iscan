import { ethers } from 'ethers';
import walletService from '../walletService.js';
import Wallet from '../../models/walletModel.js';

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
];

const provider = new ethers.JsonRpcProvider(
  process.env.BASE_RPC || 'https://mainnet.base.org'
);

const getTreasuryWallet = () => new ethers.Wallet(
  process.env.BASE_TREASURY_PRIVATE_KEY,
  provider
);

const TOKEN_ADDRESSES = {
  USDT: process.env.BASE_USDT_TOKEN,
  USDC: process.env.BASE_USDC_TOKEN,
};

async function getUserBaseAddress(userId) {
  const wallet = await Wallet.findOne({ userId });
  if (!wallet) throw new Error(`No wallet found for user ${userId}`);
  const baseChain = wallet.chainAddresses?.find(
    c => c.chain?.toLowerCase() === 'base'
  );
  if (!baseChain?.address) throw new Error(`No Base address found for user ${userId}`);
  return baseChain.address;
}

/**
 * Sends real USDT/USDC on Base chain from treasury to user's Base wallet.
 * Also credits the user's internal ledger.
 */
export async function sendStablecoinToUser({ userId, amount, currency, txRef }) {
  if (!userId || !amount || !currency) {
    throw new Error('sendStablecoinToUser: missing required params (userId, amount, currency)');
  }

  const tokenAddress = TOKEN_ADDRESSES[currency];
  if (!tokenAddress) throw new Error(`Unsupported currency: ${currency}`);

  // 1. Get user's Base address
  const toAddress = await getUserBaseAddress(userId);

  // 2. Send on-chain from treasury
  const token    = new ethers.Contract(tokenAddress, ERC20_ABI, getTreasuryWallet());
  const decimals = await token.decimals();
  const amountWei = ethers.parseUnits(amount.toString(), decimals);

  console.log(`[treasury] Sending ${amount} ${currency} on-chain to ${toAddress} | ref: ${txRef}`);
  const tx = await token.transfer(toAddress, amountWei);
  const receipt = await tx.wait();
  console.log(`[treasury] ✅ On-chain send confirmed | txHash: ${receipt.hash}`);

  // 3. Credit internal ledger
  await walletService.credit(userId, currency, amount, {
    referenceId: txRef || undefined,
    description: `Treasury on-chain send: ${amount} ${currency} → ${toAddress}`,
    transactionType: 'credit',
  });

  return {
    success:  true,
    userId,
    amount,
    currency,
    toAddress,
    txHash:  receipt.hash,
    txRef,
  };
}
