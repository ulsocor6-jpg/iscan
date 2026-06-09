import Event from './eventStreamService.js';
import Wallet from '../models/walletModel.js';

class LedgerReplayService {

  /**
   * REBUILD ENTIRE SYSTEM FROM EVENTS
   */
  async replayAll() {

    const events = await Event.getUserEvents();

    const walletMap = new Map();

    for (const event of events) {

      const { type, data } = event;

      switch (type) {

        case 'WALLET_DEBIT':
          walletMap.set(
            data.walletId,
            (walletMap.get(data.walletId) || 0) - data.amount
          );
          break;

        case 'WALLET_CREDIT':
          walletMap.set(
            data.walletId,
            (walletMap.get(data.walletId) || 0) + data.amount
          );
          break;
      }
    }

    // APPLY FIXES TO DATABASE
    for (const [walletId, balance] of walletMap.entries()) {
      await Wallet.findByIdAndUpdate(walletId, {
        balance
      });
    }

    return {
      rebuiltWallets: walletMap.size
    };
  }
}

export default new LedgerReplayService();
