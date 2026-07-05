// src/services/flower/flowerOrderGuard.js
// Deposit addresses are reused across every FLOWER order a user creates
// (getOrCreateChainAddress issues one persistent address per user per
// chain). Without this guard, a user (or a retried/duplicate request) can
// have two orders pointing at the same address at once. Whichever order's
// sweep runs first collects the deposit; the other is left matching against
// an address that now reads as empty, or — before the sweep fix — could get
// silently credited with funds that belonged to the first order.
//
// This closes that off at creation time instead of relying on the sweep's
// balance check to catch it after the fact.

import FlowerOrder from "../../models/flower/flowerOrderModel.js";

const ACTIVE_STATUSES = [
  "WAITING_DEPOSIT",
  "DEPOSIT_RECEIVED",
  "VERIFIED",
  "SWAPPING",
  "SWAPPED",
  "SETTLING"
];

export async function assertAddressAvailable(depositAddress) {
  const active = await FlowerOrder.findOne({
    depositAddress: depositAddress.toLowerCase(),
    status: { $in: ACTIVE_STATUSES }
  });

  if (active) {
    throw new Error(
      `This deposit address already has an order in progress ` +
      `(${active.orderId}, status=${active.status}). Complete or wait for ` +
      `that one to finish before starting another swap.`
    );
  }
}

export default { assertAddressAvailable };
