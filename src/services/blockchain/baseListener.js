import { ethers } from "ethers";
import DepositAddress from "../../models/depositAddressModel.js";
import { creditUser } from "../ledger/creditService.js";

const provider = new ethers.JsonRpcProvider(
  "https://mainnet.base.org"
);

const FLOWER = new ethers.Contract(
  process.env.BASE_DEPOSIT_TOKEN,
  [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)"
  ],
  provider
);

async function checkFlowerBalance(address) {
  const bal = await FLOWER.balanceOf(address);
  const decimals = await FLOWER.decimals();

  return Number(
    ethers.formatUnits(bal, decimals)
  );
}

export async function startBaseListener() {
  console.log("[BASE LISTENER] starting...");

  setInterval(async () => {
    try {
      const addresses = await DepositAddress.find({
        chain: "base",
        token: "FLOWER",
        status: "active"
      });

      for (const addr of addresses) {
        const balance =
          await checkFlowerBalance(addr.address);

        console.log(
          `[BASE SCAN] ${addr.address} balance=${balance}`
        );

        if (balance <= 0) continue;

        if (balance === addr.lastAmount) continue;

        const newAmount =
          balance - (addr.lastAmount || 0);

        if (newAmount <= 0) continue;

        await creditUser({
          userId: addr.userId,
          amount: newAmount,
          asset: "FLOWER",
          txHash: `flower-${Date.now()}`,
          chain: "base"
        });

        addr.lastAmount = balance;
        await addr.save();

        console.log(
          `[FLOWER CREDIT] +${newAmount} FLOWER`
        );
      }
    } catch (err) {
      console.error(
        "[BASE LISTENER ERROR]",
        err.message
      );
    }
  }, 15000);

  console.log(
    "[BASE LISTENER] running — polling every 15s"
  );
}
