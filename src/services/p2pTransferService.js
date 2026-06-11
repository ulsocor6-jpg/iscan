import mongoose from 'mongoose';
import Ledger from '../models/ledgerModel.js';
import Transaction from '../models/transactionModel.js';

const getBalance = async (userId, session) => {
  const result = await Ledger.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
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
};

export const transfer = async ({
  senderId,
  receiverId,
  amount,
  referenceId,
  description = 'P2P Transfer'
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const value = Number(amount);

    if (value <= 0) throw new Error('Invalid amount');

    if (senderId === receiverId) {
      throw new Error('Cannot send to yourself');
    }

    // 🔍 check balance
    const senderBalance = await getBalance(senderId, session);

    if (senderBalance < value) {
      throw new Error('Insufficient balance');
    }

    // 💸 DEBIT sender
    await Ledger.create([{
      referenceId,
      userId: senderId,
      transactionType: 'transfer',
      debit: value,
      credit: 0,
      currency: 'PHP',
      status: 'completed',
      description
    }], { session });

    // 💰 CREDIT receiver
    await Ledger.create([{
      referenceId,
      userId: receiverId,
      transactionType: 'transfer',
      debit: 0,
      credit: value,
      currency: 'PHP',
      status: 'completed',
      description
    }], { session });

    // 📊 audit log
    const tx = await Transaction.create([{
      referenceId,
      senderId,
      receiverId,
      amount: value,
      type: 'transfer',
      status: 'completed'
    }], { session });

    await session.commitTransaction();
    return tx[0];

  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};
