// src/services/flower/flowerPendingSweepService.js
//
// A FLOWER deposit address is reused across every order a user creates
// (see flowerSweepService.js). Once a swap is verified, the user's ledger
// is credited immediately — but the actual FLOWER tokens stay sitting in
// that deposit address until sweepFlowerToTreasury() runs in its next
// batch. Any raw on-chain balance read in that window still counts tokens
// that are already spoken for by a completed swap.
//
// This computes, per chain, how much of a user's on-chain FLOWER balance
// is "pending sweep" — already credited, not yet physically moved — so
// display code can net it out. sweepTxHash is the ground truth: it's only
// set once the sweep actually succeeds.

import FlowerOrder from "../../models/flower/flowerOrderModel.js";

export async function getPendingSweepTotalsByChain(userId) {
  const rows = await FlowerOrder.aggregate([
    {
      $match: {
        userId,
        direction: "FLOWER_TO_USDC",
        receivedAmount: { $gt: 0 },
        $or: [
          { sweepTxHash: { $exists: false } },
          { sweepTxHash: null },
          { sweepTxHash: "" },
        ],
      },
    },
    {
      $group: {
        _id: "$chain",
        total: { $sum: "$receivedAmount" },
      },
    },
  ]);

  const totals = {};
  for (const row of rows) {
    totals[row._id] = row.total;
  }
  return totals; // e.g. { RONIN: 42.5, BASE: 0 }
}
