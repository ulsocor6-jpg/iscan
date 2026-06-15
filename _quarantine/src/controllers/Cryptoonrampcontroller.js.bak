/**
 * cryptoOnrampController.js
 * Handles USDC/USDT → PHP conversion endpoints
 *
 * Place at: src/controllers/cryptoOnrampController.js
 */

import {
  getLiveUsdPhpRate,
  calculateConversion,
  convertCryptoToPhp,
} from '../services/cryptoOnrampService.js';

/**
 * GET /api/v1/onramp/rate
 * Returns live USD/PHP rate + fee breakdown for a given amount & channel
 *
 * Query: ?amount=100&channel=maya&token=USDC
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
 * POST /api/v1/onramp/convert
 * Initiates USDC/USDT → PHP conversion and triggers payout
 *
 * Body: { token, usdAmount, channel, mobileNumber, txHash }
 */
export const initiateConversion = async (req, res) => {
  try {
    const {
      token,
      usdAmount,
      channel,
      mobileNumber,
      txHash,
    } = req.body;

    // Basic input validation
    if (!token || !usdAmount || !channel || !mobileNumber || !txHash) {
      return res.status(400).json({
        error: 'Missing required fields: token, usdAmount, channel, mobileNumber, txHash',
      });
    }

    const result = await convertCryptoToPhp({
      userId:       req.user.id,
      token,
      usdAmount:    parseFloat(usdAmount),
      channel,
      mobileNumber,
      txHash,
    });

    return res.json(result);

  } catch (err) {
    console.error('[ONRAMP] initiateConversion error:', err);
    return res.status(400).json({ error: err.message });
  }
};

/**
 * GET /api/v1/onramp/history
 * Returns the user's crypto onramp transactions from ledger
 */
export const getOnrampHistory = async (req, res) => {
  try {
    const Ledger = (await import('../models/ledgerModel.js')).default;
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
