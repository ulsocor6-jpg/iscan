import dotenv from 'dotenv';
dotenv.config();

import { ethers } from 'ethers';

// Derive directly — bypass hdWalletService dotenv issue
const MNEMONIC = process.env.HD_WALLET_MNEMONIC;
if (!MNEMONIC) throw new Error('HD_WALLET_MNEMONIC not found');

console.log('✅ Mnemonic loaded');

const provider       = new ethers.JsonRpcProvider(process.env.BASE_RPC);
const TREASURY_ADDR  = process.env.BASE_TREASURY_WALLET;
const TREASURY_KEY   = process.env.BASE_TREASURY_PRIVATE_KEY;
const USDC_ADDR      = process.env.BASE_USDC_TOKEN || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const TARGET         = '0x747497cbfb31d104d547c913a64ef64cfd7c78b7';

const treasurySigner = new ethers.Wallet(TREASURY_KEY, provider);
const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)"
];
const usdc = new ethers.Contract(USDC_ADDR, ERC20, provider);

const usdcBal = await usdc.balanceOf(TARGET);
const usdcAmt = parseFloat(ethers.formatUnits(usdcBal, 6));
const feeData = await provider.getFeeData();
console.log(`Target USDC:  ${usdcAmt}`);
console.log(`Gas price:    ${ethers.formatUnits(feeData.gasPrice, 'gwei')} gwei`);

// Derive HD key directly in script
const hdNode = ethers.HDNodeWallet.fromPhrase(MNEMONIC, undefined, "m/44'/60'/2'/0");
let foundKey = null;
for (let i = 0; i <= 20; i++) {
  const child = hdNode.deriveChild(i);
  if (child.address.toLowerCase() === TARGET.toLowerCase()) {
    console.log(`✅ HD index: ${i}`);
    foundKey = child.privateKey;
    break;
  }
}
if (!foundKey) { console.log('❌ Key not found in indexes 0-20'); process.exit(1); }

// Estimate costs
const userSigner = new ethers.Wallet(foundKey, provider);
const usdcUser   = new ethers.Contract(USDC_ADDR, ERC20, userSigner);
const usdcGasEst = await usdcUser.transfer.estimateGas(TREASURY_ADDR, usdcBal);
const ethSendGas = 21000n;
const totalGas   = (usdcGasEst + ethSendGas) * feeData.gasPrice;
const ethPrice   = 1576;
const usdCost    = parseFloat(ethers.formatEther(totalGas)) * ethPrice;

console.log(`\nUSDC transfer gas: ${usdcGasEst} units`);
console.log(`Total ETH needed:  ${ethers.formatEther(totalGas)} ETH`);
console.log(`Total USD cost:    ~$${usdCost.toFixed(6)}`);
console.log(`USDC swept:        $${usdcAmt}`);
console.log(`Net after gas:     ~$${(usdcAmt - usdCost).toFixed(4)}`);

if (process.env.EXECUTE === 'true') {
  console.log('\n🚀 Executing sweep...');
  const ethTx = await treasurySigner.sendTransaction({
    to: TARGET,
    value: totalGas + ethers.parseEther("0.00005")
  });
  await ethTx.wait();
  console.log(`✅ Gas funded: ${ethTx.hash}`);
  await new Promise(r => setTimeout(r, 4000));

  const sweepTx = await usdcUser.transfer(TREASURY_ADDR, usdcBal);
  const receipt = await sweepTx.wait();
  const actualCostUsd = parseFloat(ethers.formatEther(receipt.gasUsed * feeData.gasPrice)) * ethPrice;
  console.log(`✅ Swept ${usdcAmt} USDC → treasury`);
  console.log(`   tx hash:     ${receipt.hash}`);
  console.log(`   gas used:    ${receipt.gasUsed} units`);
  console.log(`   actual cost: ~$${actualCostUsd.toFixed(6)}`);
  console.log(`   net gained:  ~$${(usdcAmt - actualCostUsd).toFixed(4)}`);
}
