import dotenv from 'dotenv';
dotenv.config();
import { ethers } from 'ethers';

const mnemonic     = process.env.HD_WALLET_MNEMONIC;
const TARGET       = '0x9b3e933add3144088c6729de2c82dd38194db12f';
const TREASURY     = '0xc619ECDCb23b89001fc79127b08eBB54314D7734';
const FLOWER_ADDR  = process.env.BASE_DEPOSIT_TOKEN;
const BASE_RPC     = process.env.BASE_RPC;

const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/2'/0");

let depositWallet = null;
for (let i = 0; i < 100; i++) {
  const child = hdNode.deriveChild(i);
  if (child.address.toLowerCase() === TARGET.toLowerCase()) {
    console.log(`Found at index ${i} — ${child.address}`);
    depositWallet = child;
    break;
  }
}

if (!depositWallet) { console.error('Not found in HD tree — wrong path or mnemonic'); process.exit(1); }

const provider = new ethers.JsonRpcProvider(BASE_RPC);
const signer   = depositWallet.connect(provider);

const FLOWER = new ethers.Contract(FLOWER_ADDR, [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)'
], signer);

const [bal, decimals, ethBal] = await Promise.all([
  FLOWER.balanceOf(TARGET),
  FLOWER.decimals(),
  provider.getBalance(TARGET)
]);

console.log('FLOWER at deposit addr:', ethers.formatUnits(bal, decimals));
console.log('ETH at deposit addr:   ', ethers.formatEther(ethBal));

if (bal === 0n) { console.log('Nothing to sweep'); process.exit(0); }

if (ethBal < ethers.parseEther('0.00005')) {
  console.error('Need ETH at deposit address for gas — send 0.0001 ETH to', TARGET);
  process.exit(1);
}

console.log('Sweeping to treasury...');
const tx = await FLOWER.transfer(TREASURY, bal);
console.log('Sweep tx:', tx.hash);
await tx.wait();
console.log('Done! Treasury now holds the FLOWER — run the swap next.');
