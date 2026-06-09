import crypto from 'crypto';
import Ledger from '../models/ledgerModel.js';

export const getUserBalance = async (userId) => {
  const entries = await Ledger.find({ userId, status: { $ne: 'failed' } });
  return entries.reduce((acc, tx) => acc + (tx.credit || 0) - (tx.debit || 0), 0);
};

export const createLedgerEntry = async ({
  userId, type, debit = 0, credit = 0,
  referenceId, description = '', status = 'completed',
  source = null, destination = null, currency = 'PHP'
}) => {
  return await Ledger.create({
    userId, transactionType: type, debit, credit,
    referenceId: referenceId || 'REF-' + crypto.randomBytes(6).toString('hex').toUpperCase(),
    description, status, source, destination, currency
  });
};

// Alias so transferController.js works without changes
export const postLedger = async ({ userId, type, debit = 0, credit = 0,
  description = '', source = null, destination = null, currency = 'PHP' }) => {
  return await createLedgerEntry({
    userId, type, debit, credit, description, source, destination, currency,
    referenceId: 'TX-' + crypto.randomBytes(6).toString('hex').toUpperCase()
  });
};
