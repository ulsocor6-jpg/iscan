import crypto from 'crypto';
import Wallet from '../models/walletModel.js';

/**
 * LINK WALLET (MAX 3 WALLETS PER USER)
 */
export const linkWallet = async (req, res) => {
  try {
    const { address, provider } = req.body;

    if (!address) {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    let wallet = await Wallet.findOne({ userId: req.user.id });

    // create wallet container if none exists
    if (!wallet) {
      wallet = await Wallet.create({
        userId: req.user.id,
        iscanAddress: 'ISCAN-' + crypto.randomBytes(6).toString('hex'),
        balance: 0,
        linkedWallets: []
      });
    }

    // limit 3 wallets
    if (wallet.linkedWallets.length >= 3) {
      return res.status(400).json({
        error: 'Maximum 3 wallets allowed'
      });
    }

    const exists = wallet.linkedWallets.find(
      w => w.address.toLowerCase() === address.toLowerCase()
    );

    if (exists) {
      return res.json({
        success: true,
        message: 'Wallet already linked',
        wallets: wallet.linkedWallets
      });
    }

    wallet.linkedWallets.push({
      address,
      provider: provider || 'metamask'
    });

    await wallet.save();

    return res.json({
      success: true,
      message: 'Wallet linked successfully',
      wallets: wallet.linkedWallets
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Wallet link failed' });
  }
};

/**
 * GET WALLETS
 */
export const getWallets = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ userId: req.user.id });

    if (!wallet) return res.json({ success: true, wallets: [] });
return res.json({ success: true, wallets: wallet.linkedWallets });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch wallets' });
  }
};

/**
 * UNLINK WALLET
 */
export const unlinkWallet = async (req, res) => {
  try {
    const { address } = req.body;

    let wallet = await Wallet.findOne({ userId: req.user.id });

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    wallet.linkedWallets = wallet.linkedWallets.filter(
      w => w.address.toLowerCase() !== address.toLowerCase()
    );

    await wallet.save();

    return res.json({
      success: true,
      message: 'Wallet removed',
      wallets: wallet.linkedWallets
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unlink failed' });
  }
};
