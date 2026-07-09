import "dotenv/config";
import mongoose from "mongoose";
import DepositAddress from "../src/models/depositAddressModel.js";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const addresses = await DepositAddress.find({})
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  console.log("Most recently created deposit addresses:\n");

  for (const a of addresses) {
    console.log(
      `${a.createdAt.toISOString()}  chain=${a.chain}  status=${a.status}  address=${a.address}  hdIndex=${a.hdIndex}  userId=${a.userId}`
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
