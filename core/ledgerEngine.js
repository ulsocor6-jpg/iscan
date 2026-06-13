import mongoose from 'mongoose';
import Ledger from '../src/models/ledgerModel.js';
import Wallet from '../src/models/walletModel.js';

class LedgerEngine {

  async credit({
    userId,
    amount,
    currency = 'PHP',
    referenceId,
    description,
    metadata = {}
  }) {

    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    const session = await mongoose.startSession();

    session.startTransaction();

    try {

      const entry = await Ledger.create([
        {
          referenceId,
          userId: new mongoose.Types.ObjectId(userId),
          transactionType: 'credit',
          debit: 0,
          credit: amount,
          currency,
          description,
          status: 'completed',
          metadata
        }
      ], {
        session
      });

      let newBalance = null;

      if (currency === 'PHP') {

        newBalance = await this._recalculateBalance(
          userId,
          'PHP',
          session
        );

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
      }

      await session.commitTransaction();

      return {
        entry: entry[0],
        balance: await this.getBalance(
          userId,
          currency
        )
      };

    } catch (err) {

      await session.abortTransaction();
      throw err;

    } finally {

      session.endSession();

    }
  }

  async debit({
    userId,
    amount,
    currency = 'PHP',
    referenceId,
    description,
    metadata = {}
  }) {

    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    const session = await mongoose.startSession();

    session.startTransaction();

    try {

      const currentBalance =
        await this.getBalance(
          userId,
          currency
        );

      if (currentBalance < amount) {
        throw new Error(
          `Insufficient ${currency} balance`
        );
      }

      const entry = await Ledger.create([
        {
          referenceId,
          userId: new mongoose.Types.ObjectId(userId),
          transactionType: 'debit',
          debit: amount,
          credit: 0,
          currency,
          description,
          status: 'completed',
          metadata
        }
      ], {
        session
      });

      let newBalance = null;

      if (currency === 'PHP') {

        newBalance = await this._recalculateBalance(
          userId,
          'PHP',
          session
        );

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
      }

      await session.commitTransaction();

      return {
        entry: entry[0],
        balance: await this.getBalance(
          userId,
          currency
        )
      };

    } catch (err) {

      await session.abortTransaction();
      throw err;

    } finally {

      session.endSession();

    }
  }

  async getBalance(
    userId,
    currency = 'PHP'
  ) {

    const result = await Ledger.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          currency
        }
      },
      {
        $group: {
          _id: null,
          credits: {
            $sum: '$credit'
          },
          debits: {
            $sum: '$debit'
          }
        }
      }
    ]);

    if (!result.length) {
      return 0;
    }

    return (
      Number(result[0].credits || 0) -
      Number(result[0].debits || 0)
    );
  }

  async getAllBalances(userId) {

    const result = await Ledger.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId)
        }
      },
      {
        $group: {
          _id: '$currency',
          credits: {
            $sum: '$credit'
          },
          debits: {
            $sum: '$debit'
          }
        }
      }
    ]);

    const balances = {};

    for (const row of result) {

      balances[row._id] =
        Number(row.credits || 0) -
        Number(row.debits || 0);

    }

    return balances;
  }

  async transfer({
    senderId,
    receiverId,
    amount,
    currency = 'PHP',
    referenceId,
    description = 'Transfer'
  }) {

    const session = await mongoose.startSession();

    session.startTransaction();

    try {

      const senderBalance =
        await this.getBalance(
          senderId,
          currency
        );

      if (senderBalance < amount) {
        throw new Error(
          `Insufficient ${currency} balance`
        );
      }

      await Ledger.create([
        {
          referenceId,
          userId: new mongoose.Types.ObjectId(senderId),
          transactionType: 'debit',
          debit: amount,
          credit: 0,
          currency,
          description
        },
        {
          referenceId,
          userId: new mongoose.Types.ObjectId(receiverId),
          transactionType: 'credit',
          debit: 0,
          credit: amount,
          currency,
          description
        }
      ], {
        session
      });

      if (currency === 'PHP') {

        const senderPhp =
          await this._recalculateBalance(
            senderId,
            'PHP',
            session
          );

        const receiverPhp =
          await this._recalculateBalance(
            receiverId,
            'PHP',
            session
          );

        await Wallet.findOneAndUpdate(
          { userId: senderId },
          {
            balance: senderPhp
          },
          {
            session
          }
        );

        await Wallet.findOneAndUpdate(
          { userId: receiverId },
          {
            balance: receiverPhp
          },
          {
            session
          }
        );
      }

      await session.commitTransaction();

      return {
        success: true,
        referenceId,
        currency,
        amount
      };

    } catch (err) {

      await session.abortTransaction();
      throw err;

    } finally {

      session.endSession();

    }
  }

  async _recalculateBalance(
    userId,
    currency = 'PHP',
    session
  ) {

    const result = await Ledger.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          currency
        }
      },
      {
        $group: {
          _id: null,
          credits: {
            $sum: '$credit'
          },
          debits: {
            $sum: '$debit'
          }
        }
      }
    ]).session(session);

    if (!result.length) {
      return 0;
    }

    return (
      Number(result[0].credits || 0) -
      Number(result[0].debits || 0)
    );
  }
}

export default new LedgerEngine();
