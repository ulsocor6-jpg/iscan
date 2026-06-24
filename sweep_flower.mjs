import { ethers } from 'ethers';

const mnemonic = process.env.HD_WALLET_MNEMONIC;
if (!mnemonic) { console.error('NO MNEMONIC'); process.exit(1); }

const TARGET   = '0x9b3e933add3144088c6729de2c82dd38194db12f';
const TREASURY = '0xc619ECDCb23b89001fc79127b08eBB54314D7734';
const FLOWER_ADDRESS = process.env.BASE_DEPOSIT_TOKEN;

const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/2'/0");

// Find the matching child key
let depositWallet = null;
for (let i = 0; i < 100; i++) {
  const child = hdNode.deriveChild(i);
  if (child.address.toLowerCase() === TARGET.toLowerCase()) {
    console.log(`Found at index ${i}`);
    depositWallet = child;
    break;
  }
}

if (!depositWallet) { console.error('Address not found in HD tree'); process.exit(1); }

const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC);
const signer   = depositWallet.connect(provider);

const FLOWER = new ethers.Contract(FLOWER_ADDRESS, [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)'
], signer);

const [bal, decimals] = await Promise.all([FLOWER.balanceOf(TARGET), FLOWER.decimals()]);
console.log('FLOWER balance:', ethers.formatUnits(bal, decimals));

if (bal === 0n) { console.log('Nothing to sweep'); process.exit(0); }

// Check deposit address has ETH for gas
const ethBal = await provider.getBalance(TARGET);
console.log('Deposit addr ETH:', ethers.formatEther(ethBal));
if (ethBal < ethers.parseEther('0.00005')) {
  console.error('Not enough ETH at deposit address for gas — send ~0.0001 ETH to', TARGET);
  process.exit(1);
}

console.log(`Sweeping ${ethers.formatUnits(bal, decimals)} FLOWER to treasury...`);
const tx = await FLOWER.transfer(TREASURY, bal);
console.log('Sweep tx:', tx.hash);
await tx.wait();
console.log('Sweep complete!');
