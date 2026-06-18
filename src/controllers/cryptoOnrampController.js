import DepositAddress from '../models/depositAddressModel.js';
import crypto from 'crypto';

/**
 * GET QUOTE
 */
export const getQuote = async (req, res) => {
  try {
    const rate = 56; // PHP rate placeholder

    return res.json({
      success: true,
      data: {
        rate,
        symbol: 'USDT/PHP'
      }
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

/**
 * INITIATE CONVERSION (placeholder safe version)
 */
export const initiateConversion = async (req, res) => {
  try {
    const {
      token,
      usdAmount,
      channel,
      mobileNumber,
      depositId
    } = req.body;

    const missing = [];
    if (!token) missing.push('token');
    if (!usdAmount) missing.push('usdAmount');
    if (!channel) missing.push('channel');
    if (!mobileNumber) missing.push('mobileNumber');
    if (!depositId) missing.push('depositId');

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}`
      });
    }

    const rate = 56;
    const phpAmount = Number(usdAmount) * rate;

    return res.json({
      success: true,
      data: {
        depositId,
        usdAmount,
        phpAmount,
        rate
      }
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

/**
 * GET ONRAMP HISTORY (placeholder)
 */
export const getOnrampHistory = async (req, res) => {
  try {
    return res.json({
      success: true,
      data: []
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

/**
 * GET DEPOSIT STATUS (placeholder)
 */
export const getDepositStatus = async (req, res) => {
  try {
    const { depositId } = req.params;

    return res.json({
      success: true,
      data: {
        depositId,
        status: 'pending'
      }
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

/**
 * CREATE DEPOSIT ADDRESS (REAL IMPLEMENTATION)
 */
export const createDepositAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { chain = 'ethereum', token = 'USDT' } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Missing user authentication'
      });
    }

    // Check if user already has active deposit address
    const existing = await DepositAddress.findOne({
      userId,
      chain,
      token,
      status: 'active'
    });

    if (existing) {
      return res.json({
        success: true,
        message: 'Existing deposit address returned',
        data: existing
      });
    }

    // Generate HD wallet address for user
    const { deriveUserAddress, getNextWalletIndex } = await import('../services/hdWalletService.js');
    const index = await getNextWalletIndex();
    const chainKey = chain.toUpperCase();
    const derived = await deriveUserAddress(index, chainKey);
    const address = derived.address;

    const newAddress = await DepositAddress.create({
      userId,
      chain,
      token,
      address
    });

    return res.json({
      success: true,
      message: 'Deposit address created',
      data: newAddress
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};
