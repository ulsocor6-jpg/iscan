import crypto from 'crypto';

import Ledger from '../models/ledgerModel.js';
import Transaction from '../models/transactionModel.js';

import { getBalance } from './transactionService.js';
import { getRate } from './exchangeRateService.js';

export const swapToPHP = async ({
  userId,
  amount,
  fromCurrency
}) => {

  if (!['USDC', 'USDT'].includes(fromCurrency)) {
    throw new Error('Unsupported currency');
  }

  const balance = await getBalance(
    userId,
    fromCurrency
  );

  if (balance < amount) {
    throw new Error(
      'Insufficient balance'
    );
  }

  const rate = await getRate(
    fromCurrency,
    'PHP'
  );

  const phpAmount = amount * rate;

  const referenceId =
    'SWAP-' +
    crypto.randomBytes(8).toString('hex');

  await Ledger.create({
    referenceId,
    userId,
    transactionType: 'debit',
    debit: amount,
    credit: 0,
    currency: fromCurrency,
    description: `${fromCurrency} swap debit`
  });

  await Ledger.create({
    referenceId,
    userId,
    transactionType: 'credit',
    debit: 0,
    credit: phpAmount,
    currency: 'PHP',
    description: 'PHP swap credit'
  });

  const tx = await Transaction.create({
    referenceId,
    senderId: userId,
    receiverId: userId,
    senderAddress: 'ISCAN',
    receiverAddress: 'ISCAN',
    amount,
    currency: fromCurrency,
    type: 'swap',
    status: 'settled',
    metadata: {
      rate,
      convertedAmount: phpAmount,
      destinationCurrency: 'PHP'
    },
    ledgerGroupId: referenceId
  });

  return {
    referenceId,
    rate,
    sourceAmount: amount,
    phpAmount,
    transaction: tx
  };
};
