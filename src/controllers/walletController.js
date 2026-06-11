import crypto from 'crypto';
import Wallet from '../models/walletModel.js';

const CHAIN_MAP = {
  '0x1':    { name: 'Ethereum',      token: 'ETH',  color: '#627eea' },
  '0x89':   { name: 'Polygon',       token: 'MATIC', color: '#8247e5' },
  '0x38':   { name: 'BNB Chain',     token: 'BNB',  color: '#f3ba2f' },
  '0x7e4':  { name: 'Ronin',         token: 'RON',  color: '#1273ea' },
  '0x7e5':  { name: 'Ronin Testnet', token: 'RON',  color: '#1273ea' },
  '0xa4b1': { name: 'Arbitrum',      token: 'ETH',  color: '#28a0f0' },
  '0xa':    { name: 'Optimism',      token: 'ETH',  color: '#ff0420' },
};

export const linkWallet = async (req, res) => {
  try {
    const { address, provider, chainId, nativeBalance, nativeToken, usdcBalance } = req.body;

    if (!address) {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    let wallet = await Wallet.findOne({ userId: req.user.id });

    if (!wallet) {
      const iscanAddress = 'ISCAN-' + crypto.randomBytes(8).toString('hex').toUpperCase();
      wallet = await Wallet.create({
        userId: req.user.id,
        iscanAddress,
        balance: 0,
        linkedWallets: []
      });
    }

    if (wallet.linkedWallets.length >= 3) {
      return res.status(400).json({ error: 'Maximum 3 wallets allowed' });
    }

    const chainInfo = CHAIN_MAP[chainId] || { name: 'Unknown', token: nativeToken || 'ETH' };
    const existingIndex = wallet.linkedWallets.findIndex(
      w => w.address.toLowerCase() === address.toLowerCase()
    );

    const walletData = {
      address,
      provider: provider || 'metamask',
      chainId: chainId || '0x1',
      network: chainInfo.name,
      nativeToken: chainInfo.token,
      nativeBalance: nativeBalance || 0,
      usdcBalance: usdcBalance || 0,
      addedAt: new Date()
    };

    if (existingIndex >= 0) {
      Object.assign(wallet.linkedWallets[existingIndex], walletData);
    } else {
      wallet.linkedWallets.push(walletData);
    }

    wallet.markModified('linkedWallets');
    await wallet.save();

    return res.json({
      success: true,
      message: existingIndex >= 0 ? 'Wallet updated' : 'Wallet linked',
      iscanAddress: wallet.iscanAddress,
      wallets: wallet.linkedWallets
    });

  } catch (err) {
    console.error('[LINK WALLET ERROR]:', err);
    return res.status(500).json({ error: 'Wallet link failed' });
  }
};

export const getWallets = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ userId: req.user.id });
    if (!wallet) return res.json({ success: true, wallets: [], iscanAddress: null, iscanBalance: 0 });
    return res.json({
      success: true,
      wallets: wallet.linkedWallets,
      iscanAddress: wallet.iscanAddress,
      iscanBalance: wallet.balance
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch wallets' });
  }
};

export const unlinkWallet = async (req, res) => {
  try {
    const { address } = req.body;
    const wallet = await Wallet.findOne({ userId: req.user.id });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    wallet.linkedWallets = wallet.linkedWallets.filter(
      w => w.address.toLowerCase() !== address.toLowerCase()
    );
    await wallet.save();
    return res.json({ success: true, wallets: wallet.linkedWallets });
  } catch (err) {
    return res.status(500).json({ error: 'Unlink failed' });
  }
};
