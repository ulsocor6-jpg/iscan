import { Queue } from 'bullmq';

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379
};

export const transactionQueue = new Queue('transactions', {
  connection
});
