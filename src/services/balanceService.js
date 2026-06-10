import Ledger from '../models/ledgerModel.js';
import Wallet from '../models/walletModel.js';
import TransactionReservation from '../models/transactionReservationModel.js';

const SUPPORTED_CURRENCIES = [
  'PHP',
  'USDC',
  'ETH',
  'MATIC'
];

class BalanceService {

  async getCurrencyBalance(userId, currency = 'PHP') {

    const ledgerResult = await Ledger.aggregate([
      {
        $match: {
          userId,
          currency,
          status: {
            $in: [
              'completed',
              'reserved',
              'pending'
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          credits: {
            $sum: {
              $ifNull: ['$credit', 0]
            }
          },
          debits: {
            $sum: {
              $ifNull: ['$debit', 0]
            }
          }
        }
      }
    ]);

    const ledgerBalance =
      ledgerResult.length > 0
        ? ledgerResult[0].credits - ledgerResult[0].debits
        : 0;

    const reservations = await TransactionReservation.aggregate([
      {
        $match: {
          userId,
          currency,
          status: 'ACTIVE'
        }
      },
      {
        $group: {
          _id: null,
          reserved: {
            $sum: '$amount'
          }
        }
      }
    ]);

    const reserved =
      reservations.length > 0
        ? reservations[0].reserved
        : 0;

    return {
      currency,
      ledgerBalance,
      reserved,
      available: ledgerBalance - reserved
    };
  }

  async getUserBalances(userId) {

    const balances = {};

    for (const currency of SUPPORTED_CURRENCIES) {

      balances[currency] =
        await this.getCurrencyBalance(
          userId,
          currency
        );
    }

    return balances;
  }

  async syncWallet(userId) {

    const php =
      await this.getCurrencyBalance(
        userId,
        'PHP'
      );

    const wallet =
      await Wallet.findOne({ userId });

    if (!wallet) {
      return null;
    }

    wallet.balance = php.available;

    wallet.availableBalance =
      php.available;

    wallet.pendingBalance =
      php.reserved;

    wallet.lastSyncedAt =
      new Date();

    await wallet.save();

    return wallet;
  }

  async hasSufficientBalance(
    userId,
    amount,
    currency = 'PHP'
  ) {

    const balance =
      await this.getCurrencyBalance(
        userId,
        currency
      );

    return balance.available >= amount;
  }
}

export default new BalanceService();
