import Wallet from "../models/walletModel.js";
import DepositAddress from "../models/depositAddressModel.js";
import {
  deriveBaseAddress,
  deriveRoninAddress,
  computeForwarderAddress
} from "./hdWalletService.js";

// Feature flag: when true, new deposit addresses are computed as
// forwarder-contract addresses (no private key) instead of derived EOAs.
// Existing addresses already issued are untouched either way \u2014 this
// only affects what nextHdIndex's derive() produces for BRAND NEW
// addresses going forward.
const USE_FORWARDER_ADDRESSES = process.env.USE_FORWARDER_ADDRESSES === "true";
import watchLoader from "./blockchain/watch/watchLoader.js";

// Wraps the legacy EOA deriver and the new forwarder-address computer
// behind one signature, so nextHdIndex/getOrCreateChainAddress below
// never need to know which one is active. Forwarder addresses have no
// privateKey field, on purpose \u2014 there is no key to have.
function deriveForChain(chain, legacyDerive) {
  return async (index) => {
    if (USE_FORWARDER_ADDRESSES) {
      return computeForwarderAddress(chain, index);
    }
    return legacyDerive(index);
  };
}

const CHAINS = {
  BASE: {
    dbChain: "base",
    chainId: "0x2105",
    derive: deriveForChain("BASE", deriveBaseAddress)
  },

  RONIN: {
    dbChain: "ronin",
    chainId: "0x7e4",
    derive: deriveForChain("RONIN", deriveRoninAddress)
  }
};

async function nextHdIndex(chain) {
  const cfg = CHAINS[chain];

  const last = await DepositAddress
    .findOne({ chain: cfg.dbChain })
    .sort({ hdIndex: -1 });

  return last ? last.hdIndex + 1 : 0;
}

export async function getOrCreateChainAddress(userId, chain) {

  chain = chain.toUpperCase();

  const cfg = CHAINS[chain];

  if (!cfg)
    throw new Error(`Unsupported chain: ${chain}`);

  const wallet = await Wallet.findOne({ userId });

  if (!wallet)
    throw new Error(`Wallet not found for ${userId}`);

  const existing = wallet.chainAddresses.find(
    a => a.chain === chain
  );

  if (existing?.address) {

    return {
      address: existing.address,
      chain,
      chainId: cfg.chainId,
      isNew: false
    };

  }

  const hdIndex = await nextHdIndex(chain);

  const derived = await cfg.derive(hdIndex);

  await Wallet.updateOne(
    { userId },
    {
      $push: {
        chainAddresses: {
          chain,
          address: derived.address,
          chainId: cfg.chainId,
          usdcBalance: 0,
          usdtBalance: 0
        }
      }
    }
  );

  await DepositAddress.create({
    userId,
    chain: cfg.dbChain,
    address: derived.address,
    hdIndex,
    token: "*",
    status: "active",
    addressType: USE_FORWARDER_ADDRESSES ? "FORWARDER" : "EOA"
  });

  // Immediately register the new address with the live in-memory
  // address filter so it's watchable right away — without this,
  // any deposit sent before the next server restart would be
  // silently missed, since watchLoader.load() only runs at boot.
  watchLoader.add({
    address: derived.address,
    userId,
    chain: cfg.dbChain,
    token: "*",
    hdIndex
  });

  console.log(
    `[WalletAddressService] ${chain} ${derived.address} -> ${userId}`
  );

  return {
    address: derived.address,
    chain,
    chainId: cfg.chainId,
    hdIndex,
    isNew: true
  };
}

export async function getAddressRecord(address) {

  return DepositAddress.findOne({
    address: address.toLowerCase()
  });

}

export async function findUserByAddress(address) {

  const record = await getAddressRecord(address);

  return record?.userId ?? null;

}

export async function provisionMissingAddresses(chain) {

  chain = chain.toUpperCase();

  const wallets = await Wallet.find({
    chainAddresses: {
      $not: {
        $elemMatch: {
          chain
        }
      }
    }
  });

  let success = 0;

  let failed = 0;

  for (const wallet of wallets) {

    try {

      await getOrCreateChainAddress(
        wallet.userId,
        chain
      );

      success++;

    } catch (err) {

      failed++;

      console.error(err.message);

    }

  }

  return {

    total: wallets.length,

    success,

    failed

  };

}

export default {

  getOrCreateChainAddress,

  getAddressRecord,

  findUserByAddress,

  provisionMissingAddresses

};
