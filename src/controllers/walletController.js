import crypto from 'crypto';
import Wallet from '../models/walletModel.js';

const CHAIN_MAP = {
  '0x1': { name: 'Ethereum', token: 'ETH' },
  '0x89': { name: 'Polygon', token: 'MATIC' },
  '0x38': { name: 'BNB Chain', token: 'BNB' },
  '0x7e4': { name: 'Ronin', token: 'RON' },
  '0x7e5': { name: 'Ronin Testnet', token: 'RON' },
  '0xa4b1': { name: 'Arbitrum', token: 'ETH' },
  '0xa': { name: 'Optimism', token: 'ETH' }
};

async function getOrCreateWallet(userId) {
  let wallet = await Wallet.findOne({ userId });

  if (!wallet) {
    wallet = await Wallet.create({
      userId,
      iscanAddress:
        'ISCAN-' +
        crypto.randomBytes(8).toString('hex').toUpperCase(),
      balance: 0,
      linkedWallets: []
    });
  }

  return wallet;
}

export const linkWallet = async (req, res) => {
  try {
    const {
      address,
      provider,
      chainId,
      nativeBalance,
      nativeToken,
      usdcBalance
    } = req.body;

    if (!address) {
      return res.status(400).json({
        error: 'Wallet address required'
      });
    }

    const wallet = await getOrCreateWallet(req.user.id);

    const existingIndex = wallet.linkedWallets.findIndex(
      w =>
        w.address &&
        w.address.toLowerCase() === address.toLowerCase()
    );

    const chainInfo =
      CHAIN_MAP[chainId] || {
        name: 'Unknown',
        token: nativeToken || 'ETH'
      };

    const walletData = {
      address,
      provider: provider || 'wallet',
      chainId: chainId || '0x1',
      network: chainInfo.name,
      nativeToken: chainInfo.token,
      nativeBalance: nativeBalance || 0,
      usdcBalance: usdcBalance || 0,
      addedAt: new Date()
    };

    if (existingIndex >= 0) {
      wallet.linkedWallets[existingIndex] = {
        ...wallet.linkedWallets[existingIndex],
        ...walletData
      };
    } else {
      wallet.linkedWallets.push(walletData);
    }

    wallet.markModified('linkedWallets');
    await wallet.save();

    return res.json({
      success: true,
      iscanAddress: wallet.iscanAddress,
      walletId: wallet.iscanAddress,
      balance: wallet.balance,
      wallets: wallet.linkedWallets
    });

  } catch (err) {
    console.error('[LINK WALLET ERROR]', err);

    return res.status(500).json({
      error: 'Wallet link failed'
    });
  }
};

export const getWallets = async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user.id);

    return res.json({
      success: true,
      walletId: wallet.iscanAddress,
      iscanAddress: wallet.iscanAddress,
      balance: wallet.balance,
      wallets: wallet.linkedWallets
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: 'Failed to fetch wallets'
    });
  }
};

export const getWalletMe = async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user.id);

    return res.json({
      success: true,
      walletId: wallet.iscanAddress,
      iscanAddress: wallet.iscanAddress,
      id: wallet.iscanAddress,
      _id: wallet.iscanAddress,
      balance: wallet.balance
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: 'Failed to load wallet'
    });
  }
};

export const getWalletBalance = async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user.id);

    return res.json({
      success: true,
      balance: wallet.balance || 0,
      availableBalance: wallet.balance || 0
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: 'Failed to load balance'
    });
  }
};

export const unlinkWallet = async (req, res) => {
  try {
    const { address } = req.body;

    const wallet = await Wallet.findOne({
      userId: req.user.id
    });

    if (!wallet) {
      return res.status(404).json({
        error: 'Wallet not found'
      });
    }

    wallet.linkedWallets = wallet.linkedWallets.filter(
      w =>
        w.address.toLowerCase() !==
        address.toLowerCase()
    );

    await wallet.save();

    return res.json({
      success: true,
      wallets: wallet.linkedWallets
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: 'Unlink failed'
    });
  }
};
