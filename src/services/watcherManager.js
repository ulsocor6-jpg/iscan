// services/watcherManager.js
import { Queue, Worker } from 'bullmq';
import { ethers } from 'ethers';
import DepositRequest from '../models/DepositRequest.js';
import Redis from 'ioredis';

const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
const provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_RPC_URL);

const MAX_BLOCK_RANGE = 10; // Alchemy free tier cap
const POLL_INTERVAL_MS = 30_000;

export const watcherQueue = new Queue('deposit-watcher', { connection });

// Repeatable job — but it's cheap to schedule; the guard below is what actually saves CU
await watcherQueue.add(
  'tick',
  {},
  { repeat: { every: POLL_INTERVAL_MS }, jobId: 'watcher-tick' }
);

new Worker('deposit-watcher', async () => {
  const activeRequests = await DepositRequest.find({
    status: { $in: ['WAITING', 'DETECTED'] },
  });

  if (activeRequests.length === 0) {
    return; // no RPC calls at all this tick — this is the actual savings
  }

  const currentHead = await provider.getBlockNumber(); // ONE call, shared across all requests

  for (const request of activeRequests) {
    if (request.expiresAt < new Date() && request.status === 'WAITING') {
      request.status = 'EXPIRED';
      await request.save();
      continue;
    }

    const fromBlock = request.lastCheckedBlock + 1;
    if (fromBlock > currentHead) continue; // no new blocks for this one yet

    const toBlock = Math.min(fromBlock + MAX_BLOCK_RANGE - 1, currentHead);

    const filter = {
      address: request.token !== 'NATIVE' ? request.token : undefined,
      topics: request.token !== 'NATIVE'
        ? [ethers.id('Transfer(address,address,uint256)'), null, ethers.zeroPadValue(request.address, 32)]
        : undefined,
      fromBlock,
      toBlock,
    };

    try {
      const logs = request.token !== 'NATIVE'
        ? await provider.getLogs(filter)
        : []; // native transfers need a different check — see note below

      if (logs.length > 0) {
        const log = logs[0];
        request.status = 'DETECTED';
        request.detectedTxHash = log.transactionHash;
      }

      request.lastCheckedBlock = toBlock;
      await request.save();
    } catch (err) {
      console.error(`Watcher error for request ${request._id}:`, err.message);
      // leave lastCheckedBlock unchanged — retry this range next tick
    }
  }
}, { connection });
