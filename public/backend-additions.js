/**
 * BACKEND ADDITIONS — Crypto Cash In Auto-Detection
 * ─────────────────────────────────────────────────
 * Add these two routes to your existing onramp router,
 * and add the two controller functions to cryptoOnrampController.js
 *
 * ─── 1. ADD TO: src/routes/Cryptoonramproutes.js ─────────────────────────────
 *
 *   import { getQuote, initiateConversion, getOnrampHistory,
 *            createDepositAddress, getDepositStatus } from '../controllers/cryptoOnrampController.js';
 *
 *   router.post('/deposit-address', requireAuth, createDepositAddress);
 *   router.get('/deposit-status/:depositId', requireAuth, getDepositStatus);
 *
 *
 * ─── 2. ADD TO: src/controllers/cryptoOnrampController.js ────────────────────
 */

import CryptoDeposit from '../models/cryptoDepositModel.js';
import crypto from 'crypto';

/**
 * POST /api/v1/onramp/deposit-address
 * Creates a CryptoDeposit record and returns the deposit wallet address.
 *
 * Body: { token, usdAmount, channel, mobileNumber }
 *
 * NOTE: In production, replace DEPOSIT_WALLET_ADDRESS with a per-user
 * HD-wallet derived address (e.g. from your Coinbase CDP or Fireblocks setup).
 * For now we use one shared hot-wallet address and match deposits by amount+memo.
 */
export const createDepositAddress = async (req, res) => {
  try {
    const { token, usdAmount, channel, mobileNumber } = req.body;

    if (!token || !usdAmount || !channel || !mobileNumber) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!['USDC', 'USDT'].includes(token)) {
      return res.status(400).json({ error: 'Token must be USDC or USDT' });
    }
    if (!['maya', 'gcash'].includes(channel)) {
      return res.status(400).json({ error: 'Channel must be maya or gcash' });
    }

    const referenceId = 'ONRAMP-' + crypto.randomBytes(6).toString('hex').toUpperCase();

    // ── Deposit address strategy ──────────────────────────────────────────
    // Option A (current): shared hot wallet — all deposits go to one address.
    //   Match by usdAmount + referenceId memo (works on Solana/Stellar natively;
    //   for EVM chains you identify by exact amount sent).
    // Option B (recommended later): derive a unique address per deposit using
    //   an HD wallet (ethers.js HDNodeWallet) or a custodial API (Coinbase CDP).
    const depositAddress = process.env.CRYPTO_DEPOSIT_ADDRESS || '0xYourHotWalletAddressHere';
    const chainId        = process.env.CRYPTO_CHAIN_ID        || '0x1'; // Ethereum mainnet

    // Save deposit intent to DB
    const deposit = await CryptoDeposit.create({
      userId:          req.user.id,
      referenceId,
      token,
      usdAmount:       parseFloat(usdAmount),
      expectedAddress: depositAddress,
      chainId,
      channel,
      mobileNumber,
      status:          'waiting_deposit',
    });

    return res.json({
      success:   true,
      depositId: deposit._id,
      address:   depositAddress,
      token,
      referenceId,
      chainId,
      note: 'Send exactly the USD amount shown. Include referenceId as memo where supported.',
    });

  } catch (err) {
    console.error('[ONRAMP] createDepositAddress error:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/v1/onramp/deposit-status/:depositId
 * Returns the current status of a CryptoDeposit.
 * The frontend polls this every 8 seconds.
 *
 * Your blockchain watcher (transactionWorker.js or a webhook) should update
 * the CryptoDeposit record's status + detectedTxHash + confirmations fields.
 */
export const getDepositStatus = async (req, res) => {
  try {
    const deposit = await CryptoDeposit.findOne({
      _id:    req.params.depositId,
      userId: req.user.id,        // security: only owner can check
    }).lean();

    if (!deposit) {
      return res.status(404).json({ error: 'Deposit not found' });
    }

    return res.json({
      success:       true,
      depositId:     deposit._id,
      status:        deposit.status,        // waiting_deposit | deposit_detected | confirming | processing | completed | failed
      confirmations: deposit.confirmations,
      detectedTxHash: deposit.detectedTxHash || null,
      netPHP:        deposit.metadata?.netPHP  || null,
      referenceId:   deposit.referenceId,
    });

  } catch (err) {
    console.error('[ONRAMP] getDepositStatus error:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ALSO UPDATE: initiateConversion in cryptoOnrampController.js
 * ─────────────────────────────────────────────────────────────
 * Change the body destructuring to accept depositId instead of txHash:
 *
 *   const { token, usdAmount, channel, mobileNumber, depositId } = req.body;
 *
 * Then look up the detectedTxHash from the deposit record:
 *
 *   const deposit = await CryptoDeposit.findOne({ _id: depositId, userId: req.user.id });
 *   if (!deposit) return res.status(404).json({ error: 'Deposit record not found' });
 *   if (!deposit.detectedTxHash) return res.status(400).json({ error: 'Deposit not yet detected on-chain' });
 *
 *   const result = await convertCryptoToPhp({
 *     userId, token, usdAmount: parseFloat(usdAmount),
 *     channel, mobileNumber,
 *     txHash: deposit.detectedTxHash,   // ← from DB, not from user input
 *   });
 *
 *
 * ─── 3. BLOCKCHAIN WATCHER (existing transactionWorker.js) ───────────────────
 *
 * Your transactionWorker.js should watch your hot wallet for incoming
 * USDC/USDT transfers and update CryptoDeposit records like this:
 *
 *   await CryptoDeposit.findOneAndUpdate(
 *     { expectedAddress: toAddress, usdAmount: amountReceived, status: 'waiting_deposit' },
 *     { status: 'deposit_detected', detectedTxHash: txHash, confirmations: 1 }
 *   );
 *
 *   // After N confirmations:
 *   await CryptoDeposit.findOneAndUpdate(
 *     { detectedTxHash: txHash },
 *     { status: 'processing', confirmations: 3 }
 *   );
 */
