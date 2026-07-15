import Ledger from '../models/ledgerModel.js';import Transaction from '../models/transactionModel.js';import Wallet from '../models/walletModel.js';import WalletService from './walletService.js';import crypto from 'crypto';import { ethers } from 'ethers';import { deriveBaseAddress, deriveRoninAddress } from './hdWalletService.js';import { getTokenBalance } from './onchainBalanceService.js';import { estimateGasCostUSD } from './fx/gasEstimator.js';import FeeRecord from '../models/feeModel.js';

const ERC20_ABI = ['function transfer(address to, uint256 amount) returns (bool)','function decimals() view returns (uint8)',];

const CHAIN_NATIVE_CONFIG = {base: {rpcUrl: () => process.env.BASE_RPC || 'https://mainnet.base.org',treasuryPrivateKey: () => process.env.BASE_TREASURY_PRIVATE_KEY,deriveAddress: deriveBaseAddress,tokens: () => ({USDC: process.env.BASE_USDC_TOKEN || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',USDT: process.env.BASE_USDT_TOKEN,}),},ronin: {rpcUrl: () => process.env.RONIN_RPC || 'https://api.roninchain.com/rpc',treasuryPrivateKey: () => process.env.RONIN_TREASURY_PRIVATE_KEY,deriveAddress: deriveRoninAddress,tokens: () => ({USDC: process.env.USDC_TOKEN || '0x0b7007c13325c48911f73a2dad5fa5dcbf808adc',USDT: process.env.RONIN_USDT_TOKEN,}),},};

const P2P_GAS_UNITS = 100_000n;const P2P_GAS_BUFFER_PCT = 130n;

async function ensureSenderHasGas({ chain, provider, config, senderAddress }) {const nativeBalance = await provider.getBalance(senderAddress);const feeData = await provider.getFeeData();const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas;if (!gasPrice) return;const requiredWei = (gasPrice * P2P_GAS_UNITS * P2P_GAS_BUFFER_PCT) / 100n;if (nativeBalance >= requiredWei) return;

const privateKey = config.treasuryPrivateKey();if (!privateKey) throw new Error('No treasury private key configured for ' + chain + ' - cannot fund sender gas');

const treasurySigner = new ethers.Wallet(privateKey, provider);const topUpWei = requiredWei - nativeBalance;console.log('[P2P] Funding sender gas: ' + ethers.formatEther(topUpWei) + ' native to ' + senderAddress + ' on ' + chain);const fundTx = await treasurySigner.sendTransaction({ to: senderAddress, value: topUpWei });await fundTx.wait();}

async function transferStablecoinOnChain({ senderWallet, receiverWallet, amount, asset, chain }) {const config = CHAIN_NATIVE_CONFIG[chain?.toLowerCase()];if (!config) throw new Error('Unsupported chain for on-chain transfer: ' + chain);

const senderEntry = senderWallet.chainAddresses?.find(c => c.chain?.toLowerCase() === chain.toLowerCase());const receiverEntry = receiverWallet.chainAddresses?.find(c => c.chain?.toLowerCase() === chain.toLowerCase());if (!senderEntry?.address) throw new Error('Sender has no ' + chain + ' address');if (!receiverEntry?.address) throw new Error('Receiver has no ' + chain + ' address');

const onChainBalance = await getTokenBalance(chain.toUpperCase(), senderEntry.address, asset);if (onChainBalance === null) throw new Error(asset + ' not supported on ' + chain);if (onChainBalance < amount) {throw new Error('On-chain balance mismatch: sender has ' + onChainBalance + ' ' + asset + ' on-chain, claims ' + amount);}

if (senderWallet.walletIndex === undefined || senderWallet.walletIndex === null) {throw new Error('Sender has no walletIndex - cannot sign on-chain transfer');}

const derived = await config.deriveAddress(senderWallet.walletIndex);if (!derived?.privateKey) throw new Error('Could not derive sender private key');if (derived.address.toLowerCase() !== senderEntry.address.toLowerCase()) {throw new Error("Sender's stored address does not match its derived address - refusing to sign");}

const gasCostUSD = await estimateGasCostUSD(chain).catch(() => 0);const amountToReceiver = +(amount - gasCostUSD).toFixed(6);if (amountToReceiver <= 0) {throw new Error('Transfer amount too small to cover network gas cost (~' + gasCostUSD.toFixed(4) + ' ' + asset + ')');}

const provider = new ethers.JsonRpcProvider(config.rpcUrl());await ensureSenderHasGas({ chain, provider, config, senderAddress: senderEntry.address });

const signer = new ethers.Wallet(derived.privateKey, provider);const tokenAddress = config.tokens()[asset];if (!tokenAddress) throw new Error('No ' + asset + ' contract configured on ' + chain);const contract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);const decimals = await contract.decimals();const amountWei = ethers.parseUnits(amountToReceiver.toString(), decimals);

console.log('[P2P] Sending ' + amountToReceiver + ' ' + asset + ' on ' + chain + ': ' + senderEntry.address + ' -> ' + receiverEntry.address);const tx = await contract.transfer(receiverEntry.address, amountWei);const receipt = await tx.wait();console.log('[P2P] Confirmed - tx: ' + receipt.hash);

return { txHash: receipt.hash, amountToReceiver, gasCostUSD, chain };}

class TransactionService {

async transfer({senderId,receiverId,amount,asset = 'USDT',referenceId,chain = 'base'}) {

const txRef = referenceId || crypto.randomUUID();

const senderWallet = await Wallet.findOne({ userId: senderId });

const receiverWallet = await Wallet.findOne({ userId: receiverId });

if (!senderWallet)
  throw new Error("Sender wallet not found");

if (!receiverWallet)
  throw new Error("Receiver wallet not found");

const senderBalance = await WalletService.getBalance(senderId, asset);

if (senderBalance < amount) {
  throw new Error('Insufficient balance');
}

// =========================
// 0. REAL ON-CHAIN TRANSFER (stablecoins only - PHP stays ledger-only,
//    since both users' PHP is already custodied internally with no
//    on-chain equivalent to move)
// =========================
let onChainResult = null;
if (asset !== 'PHP') {
  onChainResult = await transferStablecoinOnChain({
    senderWallet, receiverWallet, amount, asset, chain,
  });
}
const receiverAmount = onChainResult ? onChainResult.amountToReceiver : amount;

// =========================
// 1. WRITE LEDGER (SOURCE OF TRUTH)
// =========================
console.log("[TRANSFER] Starting ledger write");
console.log("[TRANSFER] Reference:", txRef);

try {

  const ledgerRows = [
    {
      referenceId: txRef,
      userId: senderId,
      transactionType: 'transfer',
      debit: amount,
      credit: 0,
      currency: asset,
      status: 'completed',
      description: `Sent ${amount} ${asset}`
    },
    {
      referenceId: txRef,
      userId: receiverId,
      transactionType: 'transfer',
      debit: 0,
      credit: receiverAmount,
      currency: asset,
      status: 'completed',
      description: onChainResult
        ? `Received ${receiverAmount} ${asset} (network fee ${onChainResult.gasCostUSD.toFixed(4)} deducted)`
        : `Received ${amount} ${asset}`
    }
  ];

  console.log("[TRANSFER] Ledger payload:");
  console.dir(ledgerRows, { depth: null });

  const result = await Ledger.create(ledgerRows);

  console.log("[TRANSFER] Ledger create OK");
  console.dir(result, { depth: 2 });

} catch (err) {

  console.error("==================================");
  console.error("[TRANSFER] LEDGER CREATE FAILED");
  console.error("Name:", err.name);
  console.error("Code:", err.code);
  console.error("Message:", err.message);

  if (err.writeErrors)
    console.dir(err.writeErrors, { depth: null });

  if (err.errors)
    console.dir(err.errors, { depth: null });

  console.error(err);

  throw err;
}

console.log("[TRANSFER] Ledger write finished successfully");

// =========================
// 2. TRANSACTION RECORD
// =========================

console.log("[TRANSFER] Creating Transaction document...");

console.log({
  senderId,
  receiverId,
  senderAddress: senderWallet.iscanAddress,
  receiverAddress: receiverWallet.iscanAddress,
  amount,
  asset,
  referenceId: txRef
});

const tx = await Transaction.create({
  referenceId: txRef,
  ledgerGroupId: txRef,

  senderId,
  receiverId,

  senderAddress: senderWallet.iscanAddress,
  receiverAddress: receiverWallet.iscanAddress,

  amount,
  currency: asset,

  type: 'transfer',
  status: 'settled',

  chain: onChainResult?.chain || null,
  metadata: onChainResult ? {
    onChainTxHash: onChainResult.txHash,
    gasCostUSD: onChainResult.gasCostUSD,
    receiverAmount,
  } : undefined,

  completedAt: new Date()
});

console.log("[TRANSFER] Transaction created successfully");

if (onChainResult && onChainResult.gasCostUSD > 0) {
  try {
    await FeeRecord.create({
      referenceId: 'FEE-' + txRef,
      userId: senderId,
      txType: 'p2p_transfer',
      currency: asset,
      grossAmount: amount,
      feePercent: +((onChainResult.gasCostUSD / amount) * 100).toFixed(3),
      feeAmount: onChainResult.gasCostUSD,
      netAmount: receiverAmount,
      metadata: { chain, txHash: onChainResult.txHash, referenceId: txRef },
    });
  } catch (feeErr) {
    console.error('[TRANSFER] FeeRecord failed (non-fatal):', feeErr.message);
  }
}

return {
  success: true,
  referenceId: txRef,
  transaction: tx
};

}

// ── STUBS (added by fix_webhook_and_stubs.sh) ────────────────────────────
// TODO: implement real lookups/state transitions against Transaction model.

async findByReference(referenceId) {
  console.warn(
    `[TransactionService.findByReference] STUB CALLED - not implemented. referenceId=${referenceId}`
  );
  return null;
}

async transitionTo(txId, newStatus, meta = {}) {
  console.warn(
    `[TransactionService.transitionTo] STUB CALLED - not implemented. txId=${txId} newStatus=${newStatus} meta=${JSON.stringify(meta)}`
  );
  return null;
}

async markSettled(txId) {
  console.warn(
    `[TransactionService.markSettled] STUB CALLED - not implemented. txId=${txId}`
  );
  return null;
}

async markFailed(txId) {
  console.warn(
    `[TransactionService.markFailed] STUB CALLED - not implemented. txId=${txId}`
  );
  return null;
}

}

export default new TransactionService();
