import express from 'express';
import {
  linkWallet,
  getWallets,
  unlinkWallet,
  getAllWalletsAdmin
} from '../controllers/walletController.js';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';
import { getUserBalance } from '../services/balanceService.js';
import Wallet from '../models/walletModel.js';
import Ledger from '../models/ledgerModel.js';
import mongoose from 'mongoose';
import { getOrCreateChainAddress } from '../services/walletAddressService.js';
import { getLiveBalancesForWallet } from '../services/onchainBalanceService.js';

// Tokens whose per-chain amounts get summed into the flat totals the
// Swaps page cards display (PHP is fiat-only and handled separately below).
const AGGREGATE_TOKENS = ['USDT', 'USDC', 'FLOWER'];

const router = express.Router();

router.get('/balance', requireAuth, async (req, res) => {
  try {
    const balance = await getUserBalance(req.user.id);
    return res.json({ success: true, balance });
  } catch (err) {
    console.error('[BALANCE ERROR]', err);
    return res.status(500).json({ message: 'Could not fetch balance.' });
  }
});

// Real on-chain balances, read live via RPC from every HD-derived wallet
// address the user has (Base, Ronin, ...). Replaces the old Ledger-sum
// approach, which only reflected what our own DB *thought* happened and
// could drift from what's actually sitting in the wallets on-chain.
router.get('/balances', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // PHP has no on-chain representation, so it's computed live from the
    // Ledger (credit - debit) — the same approach dashboardController.js
    // uses, so this endpoint and the Dashboard can never disagree about a
    // user's PHP balance again. The old approach read Wallet.balances.PHP
    // directly, a cached field that can drift from the Ledger's own
    // history (this is exactly what caused the ₱170 vs ₱68.97 mismatch).
    const phpLedgerResult = await Ledger.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), currency: 'PHP' } },
      { $group: { _id: null, credit: { $sum: { $ifNull: ['$credit', 0] } }, debit: { $sum: { $ifNull: ['$debit', 0] } } } }
    ]);
    const phpBalance = phpLedgerResult.length
      ? Math.max(0, phpLedgerResult[0].credit - phpLedgerResult[0].debit)
      : 0;

    // Make sure the user actually has HD addresses provisioned on every
    // chain we read balances from — a first-time user otherwise has no
    // chainAddresses entries yet and getLiveBalancesForWallet has nothing
    // to query. Each chain is provisioned independently so one failing
    // (e.g. missing mnemonic) doesn't block the other.
    await Promise.all(
      ['BASE', 'RONIN'].map(chain =>
        getOrCreateChainAddress(userId, chain).catch(err =>
          console.error(`[BALANCES] ${chain} address provisioning failed:`, err.message)
        )
      )
    );

    const wallet = await Wallet.findOne({ userId });
    const onchain = await getLiveBalancesForWallet(wallet);

    // Sum each token across chains for the flat cards on the Swaps page.
    // The per-chain breakdown is still returned under `onchain` so a
    // later "send" action can target a specific chain's balance directly.
    const totals = {};
    AGGREGATE_TOKENS.forEach(t => { totals[t] = 0; });

    for (const chainData of Object.values(onchain)) {
      if (!chainData || chainData.error) continue;
      for (const token of AGGREGATE_TOKENS) {
        if (typeof chainData[token] === 'number') {
          totals[token] += chainData[token];
        }
      }
    }

    return res.json({
      success: true,
      balances: {
        PHP: phpBalance,
        ...totals,
      },
      onchain, // { BASE: { address, native, USDC, USDT, FLOWER }, RONIN: { ... } }
    });
  } catch (err) {
    console.error('[BALANCES ERROR]', err);
    return res.status(500).json({ message: 'Could not fetch balances.' });
  }
});

router.post('/link', requireAuth, linkWallet);
router.post('/unlink', requireAuth, unlinkWallet);
router.get('/list', requireAuth, getWallets);
router.get('/status', (req, res) => res.json({ success: true }));

// ─── ADMIN: Treasury — list ALL platform wallets ─────────────────────────────
router.get('/admin/list', requireAuth, requireAdmin, getAllWalletsAdmin);

export default router;

// POST /api/v1/wallet/notify-transfer
// Called after user sends tx from external wallet — logs it for the listener to pick up
router.post('/notify-transfer', requireAuth, async (req, res) => {
  try {
    const { txHash, token, amount, chain, fromAddress } = req.body;
    console.log(`[WALLET] Transfer notified: ${amount} ${token} on ${chain} from ${fromAddress} tx=${txHash}`);
    // The baseListener/roninListener will detect the balance change automatically
    // This just logs it for audit purposes
    res.json({ success: true, message: 'Transfer noted — balance will update once confirmed on-chain' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
