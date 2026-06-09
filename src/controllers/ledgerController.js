import Ledger from '../models/ledgerModel.js';
import { getUserBalance } from '../services/balanceService.js';

export const getLedgerHistory = async (req, res) => {
  try {
    const entries = await Ledger.find({
      userId: req.user.id
    }).sort({ createdAt: -1 });

    const balance = await getUserBalance(req.user.id);

    return res.json({
      success: true,
      balance,
      entries
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to load ledger' });
  }
};
