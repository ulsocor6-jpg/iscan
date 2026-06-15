import crypto from 'crypto';
import CryptoDeposit from '../models/cryptoDepositModel.js';
import {
  getLiveUsdPhpRate,
  calculateConversion,
  convertCryptoToPhp,
} from '../services/cryptoOnrampService.js';

/**
 * GET /api/v1/onramp/rate
 */
export const getQuote = async (req, res) => {
  try {
    const usdAmount = parseFloat(req.query.amount) || 0;
    const channel   = req.query.channel || 'maya';
    const token     = req.query.token   || 'USDC';

    if (!['USDC', 'USDT'].includes(token)) {
      return res.status(400).json({ error: 'Token must be USDC or USDT' });
    }

    const phpRate = await getLiveUsdPhpRate();
    const quote   = usdAmount > 0
      ? calculateConversion({ usdAmount, phpRate, channel })
      : null;

    return res.json({
      success: true,
      token,
      phpRate,
      channel,
      quote,
      updatedAt: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[ONRAMP] getQuote error:', err);
    return res.status(500).json({ error: 'Failed to fetch rate' });
  }
};

/**
 * POST /api/v1/onramp/deposit-address
 * Creates a CryptoDeposit record and returns the hot-wallet deposit address.
 * Frontend calls this once amount + mobile are entered.
 */
export const createDepositAddress = async (req, res) => {
  try {
    const { token, usdAmount, channel, mobileNumber } = req.body;

    if (!token || !usdAmount || !channel || !mobileNumber) {
      return res.status(400).json({ error: 'Missing required fields: token, usdAmount, channel, mobileNumber' });
    }
    if (!['USDC', 'USDT'].includes(token)) {
      return res.status(400).json({ error: 'Token must be USDC or USDT' });
    }
    if (!['maya', 'gcash'].includes(channel)) {
      return res.status(400).json({ error: 'Channel must be maya or gcash' });
    }

    const referenceId    = 'ONRAMP-' + crypto.randomBytes(6).toString('hex').toUpperCase();
    const depositAddress = process.env.CRYPTO_DEPOSIT_ADDRESS || '0xYourHotWalletAddressHere';
    const chainId        = process.env.CRYPTO_CHAIN_ID        || '0x1';

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
    });

  } catch (err) {
    console.error('[ONRAMP] createDepositAddress error:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/v1/onramp/deposit-status/:depositId
 * Frontend polls this every 8s to check if transfer was detected on-chain.
 * Your transactionWorker updates the CryptoDeposit record when it sees the tx.
 */
export const getDepositStatus = async (req, res) => {
  try {
    const deposit = await CryptoDeposit.findOne({
      _id:    req.params.depositId,
      userId: req.user.id,
    }).lean();

    if (!deposit) {
      return res.status(404).json({ error: 'Deposit not found' });
    }

    return res.json({
      success:        true,
      depositId:      deposit._id,
      status:         deposit.status,
      confirmations:  deposit.confirmations,
      detectedTxHash: deposit.detectedTxHash || null,
      netPHP:         deposit.metadata?.netPHP || null,
      referenceId:    deposit.referenceId,
    });

  } catch (err) {
    console.error('[ONRAMP] getDepositStatus error:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/v1/onramp/convert
 * Now accepts depositId instead of txHash — txHash is pulled from the DB record.
 */
export const initiateConversion = async (req, res) => {
  try {
    const { token, usdAmount, channel, mobileNumber, depositId } = req.body;

    if (!token || !usdAmount || !channel || !mobileNumber || !depositId) {
      return res.status(400).json({
        error: 'Missing required fields: token, usdAmount, channel, mobileNumber, depositId',
      });
    }

    // Fetch the deposit record — txHash comes from DB, not from user
    const deposit = await CryptoDeposit.findOne({ _id: depositId, userId: req.user.id });
    if (!deposit) {
      return res.status(404).json({ error: 'Deposit record not found' });
    }
    if (!deposit.detectedTxHash) {
      return res.status(400).json({ error: 'Deposit not yet detected on-chain. Please wait.' });
    }

    const result = await convertCryptoToPhp({
      userId:       req.user.id,
      token,
      usdAmount:    parseFloat(usdAmount),
      channel,
      mobileNumber,
      txHash:       deposit.detectedTxHash, // from DB, never from user input
    });

    // Mark deposit as completed
    await CryptoDeposit.findByIdAndUpdate(depositId, { status: 'completed' });

    return res.json(result);

  } catch (err) {
    console.error('[ONRAMP] initiateConversion error:', err);
    return res.status(400).json({ error: err.message });
  }
};

/**
 * GET /api/v1/onramp/history
 */
export const getOnrampHistory = async (req, res) => {
  try {
    const Ledger   = (await import('../models/ledgerModel.js')).default;
    const mongoose = (await import('mongoose')).default;

    const entries = await Ledger.find({
      userId:          new mongoose.Types.ObjectId(req.user.id),
      transactionType: 'crypto_onramp',
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.json({ success: true, entries });

  } catch (err) {
    console.error('[ONRAMP] getOnrampHistory error:', err);
    return res.status(500).json({ error: 'Failed to fetch history' });
  }
};
