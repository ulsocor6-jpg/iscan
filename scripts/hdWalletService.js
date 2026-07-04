import { ethers } from 'ethers';
import crypto from 'crypto';

// Read at call-time, not import-time. Do NOT cache this into a
// module-level constant: in ESM, all `import` statements execute before
// any of the importing file's own top-level code, so a script that does
//   import { deriveUserWallets } from './hdWalletService.js';
//   dotenv.config();
// would run this module (and capture MASTER_MNEMONIC) *before*
// dotenv.config() ever populates process.env — silently locking in
// `undefined` for the entire script run, even though the mnemonic is
// genuinely present in .env. A function call always re-reads the live
// value, so import order can never cause this again.
function getMasterMnemonic() {
  return process.env.HD_WALLET_MNEMONIC;
}

export const SUPPORTED_CHAINS = {
  ETHEREUM: { name:'Ethereum', symbol:'ETH',  chainId:'0x1',    color:'#627EEA' },
  POLYGON:  { name:'Polygon',  symbol:'MATIC', chainId:'0x89',   color:'#8247E5' },
  BASE:     { name:'Base',     symbol:'ETH',   chainId:'0x2105', color:'#0052FF' },
  RONIN:    { name:'Ronin',    symbol:'RON',   chainId:'0x7e4',  color:'#1273EA' },
};

const CHAIN_PATHS = {
  ETHEREUM: "m/44'/60'/0'/0",
  POLYGON:  "m/44'/60'/1'/0",
  BASE:     "m/44'/60'/2'/0",
  RONIN:    "m/44'/60'/3'/0",
};

export async function deriveUserWallets(userIndex) {
  const mnemonic = getMasterMnemonic();
  if (!mnemonic) {
    // Previously this silently fell back to fake, non-derivable addresses
    // generated from a SHA-256 hash with no corresponding private key.
    // At least 3 wallets were created this way and now hold permanently
    // unreachable USDC. Fail loudly instead of ever doing that again.
    throw new Error(
      'HD_WALLET_MNEMONIC is not set \u2014 refusing to generate a wallet address. ' +
      'A missing mnemonic must never silently produce a fake address.'
    );
  }
  const results = {};

  for (const [chain, info] of Object.entries(SUPPORTED_CHAINS)) {
    const hdNode = ethers.HDNodeWallet.fromPhrase(
      mnemonic,
      undefined,
      CHAIN_PATHS[chain]
    );

    const child = hdNode.deriveChild(userIndex);

    results[chain] = {
      address: child.address,
      privateKey: child.privateKey,
      index: userIndex,
      chain,
      chainId: info.chainId,
      mock: false
    };
  }

  return results;
}

export async function deriveUserAddress(userIndex, chain = "ETHEREUM") {
  const wallets = await deriveUserWallets(userIndex);
  return wallets[chain.toUpperCase()] || wallets.ETHEREUM;
}

export async function getNextWalletIndex() {
  const { default: DepositAddress } = await import('../models/depositAddressModel.js');
  return await DepositAddress.countDocuments();
}

export async function deriveRoninAddress(index) {
  const mnemonic = getMasterMnemonic();
  if (!mnemonic) {
    throw new Error("HD_WALLET_MNEMONIC missing");
  }

  const hdNode = ethers.HDNodeWallet.fromPhrase(
    mnemonic,
    undefined,
    CHAIN_PATHS.RONIN
  );

  const child = hdNode.deriveChild(index);

  return {
    address: child.address.toLowerCase(),
    privateKey: child.privateKey,
    index
  };
}

export async function deriveBaseAddress(index) {
  const mnemonic = getMasterMnemonic();
  if (!mnemonic) {
    throw new Error("HD_WALLET_MNEMONIC missing");
  }

  const hdNode = ethers.HDNodeWallet.fromPhrase(
    mnemonic,
    undefined,
    CHAIN_PATHS.BASE
  );

  const child = hdNode.deriveChild(index);

  return {
    address: child.address.toLowerCase(),
    privateKey: child.privateKey,
    index
  };
}
