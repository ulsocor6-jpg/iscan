import axios from 'axios';
import DepositAddress from '../models/depositAddressModel.js';
import Wallet from '../models/walletModel.js';
import Ledger from '../models/ledgerModel.js';
import mongoose from 'mongoose';

/**
 * REAL TRON USDT (TRC20) LISTENER
 * Uses TronGrid API
 */
class DepositScannerService {
  constructor() {
    this.running = false;
    this.lastBlock = 0;
    this.interval = null;
  }

  start() {
    if (this.running) return;
    this.running = true;

    console.log('[TRON SCANNER] Started USDT TRC20 listener...');

    // poll every 10 seconds
    this.interval = setInterval(() => {
      this.scan();
    }, 10000);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.running = false;
  }

  async scan() {
    try {
      const apiKey = process.env.TRONGRID_API_KEY;

      // USDT TRC20 contract (fixed)
      const USDT_CONTRACT =
        'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

      const url =
        `https://api.trongrid.io/v1/contracts/${USDT_CONTRACT}/events?limit=20&only_confirmed=true`;

      const res = await axios.get(url, {
        headers: {
          'TRON-PRO-API-KEY': apiKey
        }
      });

      const events = res.data?.data || [];

      for (const event of events) {
        await this.processEvent(event);
      }

    } catch (err) {
      console.error('[TRON SCANNER ERROR]', err.message);
    }
  }

  /**
   * PROCESS EACH USDT TRANSFER EVENT
   */
  async processEvent(event) {
    try {
      const { result, block_timestamp, transaction_id } = event;

      if (!result || result !== 'SUCCESS') return;

      const from = event?.from;
      const to = event?.to;
      const value = event?.value;

      if (!to || !value) return;

      const depositAddress = await DepositAddress.findOne({
        address: to,
        chain: 'tron',
        status: 'active'
      });

      if (!depositAddress) return;

      const amount = Number(value) / 1e6; // USDT decimals

      // prevent double credit
      const existing = await Ledger.findOne({
        referenceId: transaction_id
      });

      if (existing) return;

      await this.creditUser({
        userId: depositAddress.userId,
        amount,
        txHash: transaction_id,
        chain: 'tron',
        depositAddress: to
      });

    } catch (err) {
      console.error('[EVENT PROCESS ERROR]', err.message);
    }
  }

  /**
   * CREDIT USER WALLET + LEDGER
   */
  async creditUser({ userId, amount, txHash, chain, depositAddress }) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const wallet = await Wallet.findOne({ userId }).session(session);

      if (!wallet) throw new Error('Wallet not found');

      wallet.balance += amount;
      await wallet.save({ session });

      await Ledger.create([{
        userId,
        type: 'DEPOSIT',
        referenceId: txHash,
        description: `USDT TRC20 deposit`,
        metadata: {
          amount,
          chain,
          depositAddress
        }
      }], { session });

      await session.commitTransaction();
      session.endSession();

      console.log(`[CREDITED] ${userId} +${amount} USDT`);
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      console.error('[CREDIT ERROR]', err.message);
    }
  }
}

export default new DepositScannerService();
