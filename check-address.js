import 'dotenv/config';
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC);

const token = new ethers.Contract(
  process.env.BASE_USDC_TOKEN,
  [
    "function balanceOf(address) view returns(uint256)",
    "function decimals() view returns(uint8)"
  ],
  provider
);

const decimals = await token.decimals();

const address = "0x3c1533407275539cc07508b27999e2ed0afc7114";

const balance = await token.balanceOf(address);

console.log("Address :", address);
console.log("USDC    :", ethers.formatUnits(balance, decimals));
