import WalletService from '../services/walletService.js';

export async function ensureWallet(req, res, next) {
  try {
    if (!req.user?._id) return res.status(401).json({ error: 'Unauthorized' });

    const wallet = await WalletService.getOrCreateWallet(req.user._id);

    req.wallet = wallet;

    next();
  } catch (err) {
    next(err);
  }
}
