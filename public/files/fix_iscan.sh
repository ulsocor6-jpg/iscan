#!/bin/bash
BASE=~/Desktop/iscansystem

# ── WALLET MODEL ─────────────────────────────────────────
cat > $BASE/src/models/walletModel.js << 'EOF'
import mongoose from 'mongoose';

const linkedWalletSchema = new mongoose.Schema({
  address:       { type: String, required: true },
  provider:      { type: String, enum: ['metamask','ronin','coinbase','other'], default: 'metamask' },
  chainId:       { type: String, default: '0x1' },
  network:       { type: String, default: 'Ethereum' },
  nativeToken:   { type: String, default: 'ETH' },
  nativeBalance: { type: Number, default: 0 },
  usdcBalance:   { type: Number, default: 0 },
  addedAt:       { type: Date, default: Date.now }
}, { _id: false });

const walletSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  iscanAddress:  { type: String, required: true, unique: true },
  balance:       { type: Number, default: 0, min: 0 },
  currency:      { type: String, default: 'PHP' },
  linkedWallets: [linkedWalletSchema],
  status:        { type: String, enum: ['ACTIVE','SUSPENDED'], default: 'ACTIVE' }
}, { timestamps: true });

export default mongoose.model('Wallet', walletSchema);
EOF
echo "walletModel done"

# ── WALLET CONTROLLER ────────────────────────────────────
cat > $BASE/src/controllers/walletController.js << 'EOF'
import crypto from 'crypto';
import Wallet from '../models/walletModel.js';

const CHAIN_MAP = {
  '0x1':    { name: 'Ethereum',      token: 'ETH'  },
  '0x89':   { name: 'Polygon',       token: 'MATIC' },
  '0x38':   { name: 'BNB Chain',     token: 'BNB'  },
  '0x7e4':  { name: 'Ronin',         token: 'RON'  },
  '0x7e5':  { name: 'Ronin Testnet', token: 'RON'  },
  '0xa4b1': { name: 'Arbitrum',      token: 'ETH'  },
  '0xa':    { name: 'Optimism',      token: 'ETH'  },
};

export const linkWallet = async (req, res) => {
  try {
    const { address, provider, chainId, nativeBalance, usdcBalance } = req.body;
    if (!address) return res.status(400).json({ error: 'Wallet address required' });

    const chainInfo = CHAIN_MAP[chainId] || { name: 'Unknown', token: 'ETH' };

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

    const idx = wallet.linkedWallets.findIndex(
      w => w.address.toLowerCase() === address.toLowerCase()
    );

    const entry = {
      address,
      provider: provider || 'metamask',
      chainId: chainId || '0x1',
      network: chainInfo.name,
      nativeToken: chainInfo.token,
      nativeBalance: nativeBalance || 0,
      usdcBalance: usdcBalance || 0,
      addedAt: new Date()
    };

    if (idx >= 0) {
      wallet.linkedWallets[idx] = entry;
    } else {
      if (wallet.linkedWallets.length >= 3) {
        return res.status(400).json({ error: 'Maximum 3 wallets allowed' });
      }
      wallet.linkedWallets.push(entry);
    }

    wallet.markModified('linkedWallets');
    await wallet.save();

    return res.json({
      success: true,
      message: idx >= 0 ? 'Wallet updated' : 'Wallet linked',
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
EOF
echo "walletController done"

# ── LEDGER SERVICE (fix postLedger alias) ────────────────
cat > $BASE/src/services/ledgerService.js << 'EOF'
import crypto from 'crypto';
import Ledger from '../models/ledgerModel.js';

export const getUserBalance = async (userId) => {
  const entries = await Ledger.find({ userId, status: { $ne: 'failed' } });
  return entries.reduce((acc, e) => acc + (e.credit || 0) - (e.debit || 0), 0);
};

export const createLedgerEntry = async ({
  userId, type, debit = 0, credit = 0,
  referenceId, description = '', status = 'completed',
  source = null, destination = null, currency = 'PHP'
}) => {
  return await Ledger.create({
    userId, transactionType: type, debit, credit,
    referenceId: referenceId || 'REF-' + crypto.randomBytes(6).toString('hex').toUpperCase(),
    description, status, source, destination, currency
  });
};

// alias used by transferController
export const postLedger = async ({ userId, type, debit = 0, credit = 0,
  description = '', source = null, destination = null, currency = 'PHP' }) => {
  return createLedgerEntry({
    userId, type, debit, credit, description, source, destination, currency
  });
};
EOF
echo "ledgerService done"

# ── BALANCE SERVICE ───────────────────────────────────────
cat > $BASE/src/services/balanceService.js << 'EOF'
import Ledger from '../models/ledgerModel.js';

export const getUserBalance = async (userId) => {
  const entries = await Ledger.find({ userId, status: { $ne: 'failed' } });
  return entries.reduce((acc, e) => acc + (e.credit || 0) - (e.debit || 0), 0);
};
EOF
echo "balanceService done"

# ── LEDGER CONTROLLER ─────────────────────────────────────
cat > $BASE/src/controllers/ledgerController.js << 'EOF'
import Ledger from '../models/ledgerModel.js';
import { getUserBalance } from '../services/balanceService.js';

export const getLedgerHistory = async (req, res) => {
  try {
    const entries = await Ledger.find({ userId: req.user.id }).sort({ createdAt: -1 });
    const balance = await getUserBalance(req.user.id);
    return res.json({ success: true, balance, entries });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to load ledger' });
  }
};
EOF
echo "ledgerController done"

echo "ALL DONE"
