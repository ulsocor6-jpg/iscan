import crypto from "crypto";
import Wallet from "../models/walletModel.js";
import {
  deriveUserWallets,
  SUPPORTED_CHAINS,
} from "../services/hdWalletService.js";
import walletService from "../services/walletService.js";
import {
  getTokenBalance,
} from "../services/onchainBalanceService.js";

const CHAIN_MAP = {
  "0x1": { name: "Ethereum", token: "ETH" },
  "0x89": { name: "Polygon", token: "MATIC" },
  "0x38": { name: "BNB Chain", token: "BNB" },
  "0x7e4": { name: "Ronin", token: "RON" },
  "0x2105": { name: "Base", token: "ETH" },
  "0xa4b1": { name: "Arbitrum", token: "ETH" },
  "0xa": { name: "Optimism", token: "ETH" },
};

const CHAIN_ASSETS = {
  BASE: ["ETH", "USDC", "FLOWER"],
  RONIN: ["RON", "FLOWER", "AXS", "SLP"],
  ETHEREUM: ["ETH", "USDT", "USDC"],
  POLYGON: ["MATIC", "USDT", "USDC"],
};

async function getOrCreateWallet(userId) {
  let wallet = await Wallet.findOne({ userId });

  if (!wallet) {
    const walletIndex = await Wallet.countDocuments();

    const derived = await deriveUserWallets(walletIndex);

    const chainAddresses = Object.entries(derived).map(
      ([chain, data]) => ({
        chain,
        address: data.address,
        chainId: SUPPORTED_CHAINS[chain]?.chainId,
      })
    );

    wallet = await Wallet.create({
      userId,
      walletIndex,
      iscanAddress:
        "ISCAN-" +
        crypto.randomBytes(8).toString("hex").toUpperCase(),
      balances: new Map(),
      chainAddresses,
      activeChain: "BASE",
      linkedWallets: [],
    });
  }

  return wallet;
}

async function buildChains(userId, wallet) {
  const chains = [];

  for (const chain of wallet.chainAddresses) {
    const symbols = CHAIN_ASSETS[chain.chain] || [];

    const assets = [];

    for (const symbol of symbols) {
      let balance = 0;

      try {
        balance = await getTokenBalance(
          chain.chain,
          chain.address,
          symbol
        );

        if (balance === null) {
          balance = await walletService.getBalance(
            userId,
            symbol
          );
        }
      } catch (err) {
        balance = await walletService.getBalance(
          userId,
          symbol
        );
      }

      assets.push({
        symbol,
        balance,
      });
    }

    chains.push({
      chain: chain.chain,
      chainId: chain.chainId,
      address: chain.address,
      assets,
    });
  }

  return chains;
}
export const getWallets = async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user.id);

    const chains = await buildChains(req.user.id, wallet);

    return res.json({
      success: true,
      iscanAddress: wallet.iscanAddress,
      activeChain: wallet.activeChain,
      chains,
      wallets: wallet.linkedWallets,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: "Failed to fetch wallets",
    });
  }
};

export const getWalletMe = async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user.id);

    const chains = await buildChains(req.user.id, wallet);

    return res.json({
      success: true,
      id: wallet.iscanAddress,
      _id: wallet.iscanAddress,
      iscanAddress: wallet.iscanAddress,
      activeChain: wallet.activeChain,
      chains,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: "Failed to load wallet",
    });
  }
};

export const switchChain = async (req, res) => {
  try {
    const { chain } = req.body;

    if (!SUPPORTED_CHAINS[chain]) {
      return res.status(400).json({
        error: "Unsupported chain",
      });
    }

    const wallet = await Wallet.findOne({
      userId: req.user.id,
    });

    if (!wallet) {
      return res.status(404).json({
        error: "Wallet not found",
      });
    }

    wallet.activeChain = chain;

    await wallet.save();

    return res.json({
      success: true,
      activeChain: chain,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: "Switch failed",
    });
  }
};
export const linkWallet = async (req, res) => {
  try {
    const {
      address,
      provider,
      chainId,
      nativeBalance,
      nativeToken,
      usdcBalance,
    } = req.body;

    const wallet = await getOrCreateWallet(req.user.id);

    const chainInfo =
      CHAIN_MAP[chainId] || {
        name: "Unknown",
        token: nativeToken || "ETH",
      };

    const record = {
      address,
      provider,
      chainId,
      network: chainInfo.name,
      nativeToken: chainInfo.token,
      nativeBalance: nativeBalance || 0,
      usdcBalance: usdcBalance || 0,
      addedAt: new Date(),
    };

    const existing = wallet.linkedWallets.findIndex(
      (w) =>
        w.address.toLowerCase() === address.toLowerCase()
    );

    if (existing >= 0) {
      wallet.linkedWallets[existing] = record;
    } else {
      wallet.linkedWallets.push(record);
    }

    wallet.markModified("linkedWallets");

    await wallet.save();

    return res.json({
      success: true,
      wallets: wallet.linkedWallets,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: "Wallet link failed",
    });
  }
};

export const unlinkWallet = async (req, res) => {
  try {
    const { address } = req.body;

    const wallet = await Wallet.findOne({
      userId: req.user.id,
    });

    if (!wallet) {
      return res.status(404).json({
        error: "Wallet not found",
      });
    }

    wallet.linkedWallets = wallet.linkedWallets.filter(
      (w) =>
        w.address.toLowerCase() !==
        address.toLowerCase()
    );

    await wallet.save();

    return res.json({
      success: true,
      wallets: wallet.linkedWallets,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: "Unlink failed",
    });
  }
};

export const getAllWalletsAdmin = async (req, res) => {
  try {
    const wallets = await Wallet.find().select(
      "iscanAddress chainAddresses createdAt status"
    );

    return res.json({
      success: true,
      wallets,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: "Failed to fetch wallets",
    });
  }
};
