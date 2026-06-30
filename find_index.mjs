import dotenv from 'dotenv';
dotenv.config();
import { ethers } from 'ethers';

const MNEMONIC = process.env.HD_WALLET_MNEMONIC;
const TARGET   = '0x747497cbfb31d104d547c913a64ef64cfd7c78b7';
const hdNode   = ethers.HDNodeWallet.fromPhrase(MNEMONIC, undefined, "m/44'/60'/2'/0");

console.log('Scanning indexes 0-50...\n');
for (let i = 0; i <= 50; i++) {
  const child = hdNode.deriveChild(i);
  const match = child.address.toLowerCase() === TARGET.toLowerCase();
  console.log(`index ${i}: ${child.address} ${match ? '✅ MATCH!' : ''}`);
  if (match) { console.log(`\nPrivate key found at index ${i}`); break; }
}
