import { ethers } from 'ethers';
import crypto from 'crypto';

const MASTER_MNEMONIC = process.env.HD_WALLET_MNEMONIC;

export const SUPPORTED_CHAINS = {
  ETHEREUM: { name:'Ethereum', symbol:'ETH',  chainId:'0x1',    color:'#627EEA' },
  POLYGON:  { name:'Polygon',  symbol:'MATIC', chainId:'0x89',   color:'#8247E5' },
  BASE:     { name:'Base',     symbol:'ETH',   chainId:'0x2105', color:'#0052FF' },
  RONIN:    { name:'Ronin',    symbol:'RON',   chainId:'0x7e4',  color:'#1273EA' },
};

export async function deriveUserWallets(userIndex) {
  if (!MASTER_MNEMONIC) {
    const seed = process.env.HD_WALLET_SEED || 'iscan-default-seed';
    const hash = crypto.createHash('sha256').update(seed + '-' + userIndex).digest('hex');
    const mockAddr = '0x' + hash.slice(0, 40);
    return Object.fromEntries(
      Object.entries(SUPPORTED_CHAINS).map(([chain, info]) => [
        chain, { address: mockAddr, index: userIndex, mock: true, chain, chainId: info.chainId }
      ])
    );
  }
  const results = {};
  const hdNode = ethers.HDNodeWallet.fromPhrase(MASTER_MNEMONIC, undefined, "m/44'/60'/0'/0");
  for (const [chain, info] of Object.entries(SUPPORTED_CHAINS)) {
    const child = hdNode.deriveChild(userIndex);
    results[chain] = { address: child.address, privateKey: child.privateKey, index: userIndex, chain, chainId: info.chainId, mock: false };
  }
  return results;
}

export async function deriveUserAddress(userIndex) {
  const wallets = await deriveUserWallets(userIndex);
  return wallets.ETHEREUM;
}

export async function getNextWalletIndex() {
  const { default: DepositAddress } = await import('../models/depositAddressModel.js');
  return await DepositAddress.countDocuments();
}
