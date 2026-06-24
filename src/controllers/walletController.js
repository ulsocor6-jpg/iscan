import crypto from 'crypto';
import Wallet from '../models/walletModel.js';
import { deriveUserWallets, SUPPORTED_CHAINS } from '../services/hdWalletService.js';
import DepositAddress from '../models/depositAddressModel.js';
import walletService from '../services/walletService.js';

const CHAIN_MAP = {
  '0x1':    { name:'Ethereum', token:'ETH'   },
  '0x89':   { name:'Polygon',  token:'MATIC' },
  '0x38':   { name:'BNB Chain',token:'BNB'   },
  '0x7e4':  { name:'Ronin',    token:'RON'   },
  '0x2105': { name:'Base',     token:'ETH'   },
  '0xa4b1': { name:'Arbitrum', token:'ETH'   },
  '0xa':    { name:'Optimism', token:'ETH'   },
};

function formatBalances(wallet) {
  if (!wallet || !wallet.balances) return {};
  return wallet.balances instanceof Map ? Object.fromEntries(wallet.balances) : wallet.balances;
}

async function getOrCreateWallet(userId) {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    const walletIndex = await Wallet.countDocuments();
    const ws    = await deriveUserWallets(walletIndex);
    const chainAddresses = Object.entries(ws).map(([chain, data]) => ({
      chain, address: data.address, chainId: SUPPORTED_CHAINS[chain]?.chainId || '0x1',
      usdtBalance:0, usdcBalance:0,
    }));
    wallet = await Wallet.create({
      userId,
      iscanAddress: 'ISCAN-' + crypto.randomBytes(8).toString('hex').toUpperCase(),
      balances: new Map(),
      chainAddresses,
      activeChain: 'ETHEREUM',
      linkedWallets: [],
    });
  }
  return wallet;
}

export const getWallets = async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user.id);

    const balances = {
      PHP: await walletService.getBalance(req.user.id,'PHP'),
      USDT: await walletService.getBalance(req.user.id,'USDT'),
      USDC: await walletService.getBalance(req.user.id,'USDC'),
      FLOWER: await walletService.getBalance(req.user.id,'FLOWER'),
      RON: await walletService.getBalance(req.user.id,'RON'),
      ETH: await walletService.getBalance(req.user.id,'ETH')
    };

    return res.json({
      success:true,
      iscanAddress:wallet.iscanAddress,
      balances,
      chainAddresses:wallet.chainAddresses,
      activeChain:wallet.activeChain,
      chains:SUPPORTED_CHAINS,
      wallets:wallet.linkedWallets
    });
  } catch(err) {
    console.error(err);
    res.status(500).json({ error:'Failed to fetch wallets' });
  }
};

export const getWalletMe = async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user.id);

    const balances = {
      PHP: await walletService.getBalance(req.user.id,'PHP'),
      USDT: await walletService.getBalance(req.user.id,'USDT'),
      USDC: await walletService.getBalance(req.user.id,'USDC'),
      FLOWER: await walletService.getBalance(req.user.id,'FLOWER'),
      RON: await walletService.getBalance(req.user.id,'RON'),
      ETH: await walletService.getBalance(req.user.id,'ETH')
    };

    return res.json({
      success:true,
      iscanAddress:wallet.iscanAddress,
      id:wallet.iscanAddress,
      _id:wallet.iscanAddress,
      balances,
      activeChain:wallet.activeChain,
      chainAddresses:wallet.chainAddresses
    });
  } catch(err) {
    res.status(500).json({ error:'Failed to load wallet' });
  }
};

export const getWalletBalance = async (req, res) => {
  try {
    const asset = req.query.asset || 'USDT';
    const balance = await walletService.getBalance(req.user.id, asset);

    return res.json({
      success:true,
      asset,
      balance
    });
  } catch(err) {
    res.status(500).json({ error:'Failed to load balance' });
  }
};

export const switchChain = async (req, res) => {
  try {
    const { chain } = req.body;
    if (!SUPPORTED_CHAINS[chain]) return res.status(400).json({ error:'Unsupported chain' });
    const wallet = await Wallet.findOne({ userId: req.user.id });
    if (!wallet) return res.status(404).json({ error:'Wallet not found' });
    wallet.activeChain = chain;
    await wallet.save();
    const chainAddr = wallet.chainAddresses.find(c => c.chain === chain);
    return res.json({ success:true, activeChain:chain, address:chainAddr?.address });
  } catch(err) { res.status(500).json({ error:'Switch failed' }); }
};

export const linkWallet = async (req, res) => {
  try {
    const { address, provider, chainId, nativeBalance, nativeToken, usdcBalance } = req.body;
    if (!address) return res.status(400).json({ error:'Wallet address required' });
    const wallet    = await getOrCreateWallet(req.user.id);
    const chainInfo = CHAIN_MAP[chainId] || { name:'Unknown', token: nativeToken||'ETH' };
    const walletData = { address, provider:provider||'wallet', chainId:chainId||'0x1', network:chainInfo.name, nativeToken:chainInfo.token, nativeBalance:nativeBalance||0, usdcBalance:usdcBalance||0, addedAt:new Date() };
    const idx = wallet.linkedWallets.findIndex(w => w.address?.toLowerCase() === address.toLowerCase());
    if (idx >= 0) wallet.linkedWallets[idx] = { ...wallet.linkedWallets[idx], ...walletData };
    else wallet.linkedWallets.push(walletData);
    wallet.markModified('linkedWallets');
    await wallet.save();
    return res.json({ success:true, iscanAddress:wallet.iscanAddress, wallets:wallet.linkedWallets });
  } catch(err) { console.error(err); res.status(500).json({ error:'Wallet link failed' }); }
};

export const unlinkWallet = async (req, res) => {
  try {
    const { address } = req.body;
    const wallet = await Wallet.findOne({ userId: req.user.id });
    if (!wallet) return res.status(404).json({ error:'Wallet not found' });
    wallet.linkedWallets = wallet.linkedWallets.filter(w => w.address.toLowerCase() !== address.toLowerCase());
    await wallet.save();
    return res.json({ success:true, wallets:wallet.linkedWallets });
  } catch(err) { res.status(500).json({ error:'Unlink failed' }); }
};

export const getAllWalletsAdmin = async (req, res) => {
  try {
    const wallets = await Wallet.find({}).select('iscanAddress status balances chainAddresses createdAt');
    return res.json({
      success: true,
      wallets: wallets.map(w => ({
        iscanAddress: w.iscanAddress,
        status: w.status,
        balances: formatBalances(w),
        chainAddresses: w.chainAddresses,
        createdAt: w.createdAt,
      }))
    });
  } catch (err) {
    console.error('[ADMIN WALLET LIST ERROR]', err);
    res.status(500).json({ error: 'Failed to fetch wallets' });
  }
};
