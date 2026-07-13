import Wallet from "../models/walletModel.js";
import activeDepositSessions from "../services/blockchain/watch/activeDepositSessions.js";

/**
 * GET QUOTE
 */
export const getQuote = async (req, res) => {
  try {
    return res.json({
      success: true,
      data: {
        rate: 56,
        symbol: "USDT/PHP"
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
 * INITIATE CONVERSION
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

    if (!token) missing.push("token");
    if (!usdAmount) missing.push("usdAmount");
    if (!channel) missing.push("channel");
    if (!mobileNumber) missing.push("mobileNumber");
    if (!depositId) missing.push("depositId");

    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(", ")}`
      });
    }

    const rate = 56;

    return res.json({
      success: true,
      data: {
        depositId,
        usdAmount,
        phpAmount: Number(usdAmount) * rate,
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
 * HISTORY
 */
export const getOnrampHistory = async (req, res) => {
  return res.json({
    success: true,
    data: []
  });
};

/**
 * STATUS
 */
export const getDepositStatus = async (req, res) => {
  return res.json({
    success: true,
    data: {
      depositId: req.params.depositId,
      status: "pending"
    }
  });
};

/**
 * DEPOSIT ADDRESS
 *
 * Base and Ronin now return the address already assigned
 * inside wallet.chainAddresses.
 *
 * TRON remains on the legacy deposit-address flow.
 */
export const createDepositAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { chain } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Missing user authentication"
      });
    }

    if (!chain || chain.toLowerCase() === "tron") {
      return res.status(400).json({
        success: false,
        message: "TRON still uses the legacy deposit system."
      });
    }

    const wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found."
      });
    }

    const chainAddress = wallet.chainAddresses.find(
      c => c.chain === chain.toUpperCase()
    );

    if (!chainAddress) {
      return res.status(404).json({
        success: false,
        message: `${chain.toUpperCase()} address not found.`
      });
    }

    // Mark this chain as actively awaited so blockchainEngine polls it
    // fast (its normal adaptive cadence) instead of the 12h idle cadence,
    // until the deposit is confirmed (cleared in depositProcessor.js) or
    // the session's 30-min TTL lapses on its own.
    activeDepositSessions.markActive(
      chain.toLowerCase(),
      `${userId}:${chainAddress.address}`
    );

    return res.json({
      success: true,
      message: "Wallet address returned.",
      data: {
        address: chainAddress.address,
        chain: chainAddress.chain,
        chainId: chainAddress.chainId
      }
    });

  } catch (err) {
    console.error("[CREATE DEPOSIT ADDRESS]", err);

    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};
