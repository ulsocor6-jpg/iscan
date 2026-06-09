import { Worker } from 'bullmq';
import transactionService from '../services/transactionService.js';

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379
};

export const transactionWorker = new Worker(
  'transactions',
  async job => {
    const data = job.data;

    return await transactionService.transfer(data);
  },
  { connection }
);
