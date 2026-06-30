import { ethers } from "ethers";
import DepositAddress from "../../models/depositAddressModel.js";
import { deriveBaseAddress } from "../hdWalletService.js";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

const provider = new ethers.JsonRpcProvider(
  process.env.BASE_RPC || "https://mainnet.base.org"
);

const TOKENS = {
  USDC: process.env.BASE_USDC_TOKEN,
  USDT: process.env.BASE_USDT_TOKEN,
};

const TREASURY = process.env.BASE_TREASURY_WALLET;

export async function receiveStablecoinFromUser({
  userId,
  currency,
  amount,
}) {
  const deposit = await DepositAddress.findOne({
    userId,
    chain: "base",
    token: currency,
    status: "active"
  });

  if (!deposit)
    throw new Error("Deposit address not found");

  const derived = await deriveBaseAddress(deposit.hdIndex);

  if (!derived?.privateKey)
    throw new Error("Unable to derive private key");

  const signer = new ethers.Wallet(
    derived.privateKey,
    provider
  );

  const token = new ethers.Contract(
    TOKENS[currency],
    ERC20_ABI,
    signer
  );

  const decimals = await token.decimals();

  const onchainBalance = await token.balanceOf(deposit.address);

  const requested = ethers.parseUnits(
    amount.toString(),
    decimals
  );

  if (onchainBalance < requested) {
    throw new Error(
      `On-chain balance lower than requested swap`
    );
  }

  const tx = await token.transfer(
    TREASURY,
    onchainBalance
  );

  const receipt = await tx.wait();

  console.log(
    `[TREASURY RECEIVE] Swept ${currency} from ${deposit.address} -> Treasury (${receipt.hash})`
  );

  return receipt.hash;
}
