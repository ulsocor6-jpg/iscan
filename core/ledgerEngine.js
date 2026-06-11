import mongoose from 'mongoose';
import Ledger from '../src/models/ledgerModel.js';
import Wallet from '../src/models/walletModel.js';

class LedgerEngine {
  async credit({ userId, amount, referenceId, description, metadata = {} }) {
    if (amount <= 0) throw new Error('Amount must be positive');

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const entry = await Ledger.create([{
        referenceId,
        userId: new mongoose.Types.ObjectId(userId),
        transactionType: 'credit',
        debit: 0,
        credit: amount,
        currency: 'PHP',
        description,
        status: 'completed',
        metadata
      }], { session });

      const newBalance = await this._recalculateBalance(userId, session);

      await Wallet.findOneAndUpdate(
        { userId },
        {
          balance: newBalance,
          updatedAt: new Date()
        },
        {
          upsert: true,
          session
        }
      );

      await session.commitTransaction();

      return {
        entry: entry[0],
        newBalance
      };

    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  async debit({ userId, amount, referenceId, description, metadata = {} }) {
    if (amount <= 0) throw new Error('Amount must be positive');

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const currentBalance = await this.getBalance(userId);

      if (currentBalance < amount) {
        throw new Error('Insufficient funds');
      }

      const entry = await Ledger.create([{
        referenceId,
        userId: new mongoose.Types.ObjectId(userId),
        transactionType: 'debit',
        debit: amount,
        credit: 0,
        currency: 'PHP',
        description,
        status: 'completed',
        metadata
      }], { session });

      const newBalance = await this._recalculateBalance(userId, session);

      await Wallet.findOneAndUpdate(
        { userId },
        {
          balance: newBalance,
          updatedAt: new Date()
        },
        {
          upsert: true,
          session
        }
      );

      await session.commitTransaction();

      return {
        entry: entry[0],
        newBalance
      };

    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  async getBalance(userId) {
    const result = await Ledger.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId)
        }
      },
      {
        $group: {
          _id: null,
          credits: { $sum: '$credit' },
          debits: { $sum: '$debit' }
        }
      }
    ]);

    if (!result.length) return 0;

    return result[0].credits - result[0].debits;
  }

  async _recalculateBalance(userId, session) {
    const result = await Ledger.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId)
        }
      },
      {
        $group: {
          _id: null,
          credits: { $sum: '$credit' },
          debits: { $sum: '$debit' }
        }
      }
    ]).session(session);

    if (!result.length) return 0;

    return result[0].credits - result[0].debits;
  }
}

export default new LedgerEngine();
