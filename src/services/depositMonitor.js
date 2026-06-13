import cron from 'node-cron';

export function startDepositMonitor() {
  console.log('[DEPOSIT MONITOR] Starting...');

  cron.schedule('*/1 * * * *', async () => {
    try {
      console.log(
        `[DEPOSIT MONITOR] Scan started ${new Date().toISOString()}`
      );

      // scanner logic will go here later

    } catch (err) {
      console.error('[DEPOSIT MONITOR]', err);
    }
  });

  console.log('[DEPOSIT MONITOR] Running');
}
