// src/services/flower/flowerOrderGuard.js
// Deposit addresses are reused across every FLOWER order a user creates
// (getOrCreateChainAddress issues one persistent address per user per
// chain). Without this guard, a user (or a retried/duplicate request) can
// have two orders pointing at the same address at once.
//
// FAILED_SWEEP / FAILED_SWAP / FAILED_SETTLE stay in the active set
// deliberately: those are retryable states, not terminal ones, so the
// address must stay locked to that order until it either completes or
// exhausts retries into terminal FAILED — otherwise a new order could be
// created against an address whose stuck order later gets manually retried
// and sweeps funds meant for the new order.

import FlowerOrder from "../../models/flower/flowerOrderModel.js";

const ACTIVE_STATUSES = [
  "WAITING_DEPOSIT",
  "DEPOSIT_RECEIVED",
  "VERIFIED",
  "SWAPPING",
  "SWAPPED",
  "SETTLING",
  "FAILED_SWEEP",
  "FAILED_SWAP",
  "FAILED_SETTLE"
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
