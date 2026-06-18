import Transaction from '../models/transactionModel.js';
import CashoutRequest from '../models/CashoutRequest.js';

export async function runStatusWorker() {
  const now = new Date();

  // Swap: processing → completed after 12hrs
  const swapsDue = await Transaction.find({
    type: 'swap',
    status: 'processing',
    processAt: { $lte: now }
  });
  for (const tx of swapsDue) {
    tx.status = 'completed';
    tx.completedAt = now;
    await tx.save();
    console.log(`[STATUS WORKER] Swap completed: ${tx.referenceId}`);
  }

  // Cashout: PENDING → PROCESSING after 12hrs
  const cashoutsDue = await CashoutRequest.find({
    status: 'PENDING',
    processAt: { $lte: now }
  });
  for (const c of cashoutsDue) {
    c.status = 'PROCESSING';
    await c.save();
    console.log(`[STATUS WORKER] Cashout processing: ${c._id}`);
  }

  console.log(`[STATUS WORKER] Done. ${swapsDue.length} swaps, ${cashoutsDue.length} cashouts advanced.`);
}

// Run every 60 seconds
export function startStatusWorker() {
  console.log('[STATUS WORKER] Started');
  setInterval(runStatusWorker, 60 * 1000);
  runStatusWorker(); // run immediately on start
}
