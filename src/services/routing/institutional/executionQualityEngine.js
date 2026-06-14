import mevProtectionService from './mevProtectionService.js';
import ledgerService from '../../ledgerService.js';

class ExecutionQualityEngine {
  async execute({ venue, user, amount }) {
    // 1. MEV protection layer
    await mevProtectionService.protect(venue);

    if (venue.type === 'DEX_1INCH') {
      return this.executeDEX(venue, user, amount);
    }

    if (venue.type === 'TREASURY') {
      return this.executeInternal(venue, user, amount);
    }

    throw new Error('Unsupported venue');
  }

  async executeDEX(venue, user, amount) {
    // placeholder for signed tx execution
    return {
      status: 'ONCHAIN_EXECUTED',
      venue: venue.provider,
      txHash: `0x${Math.random().toString(16).slice(2)}`
    };
  }

  async executeInternal(venue, user, amount) {
    await ledgerService.credit({
      userId: user._id,
      amount: venue.output,
      type: 'INTERNAL_LIQUIDITY_FILL'
    });

    return {
      status: 'LEDGER_EXECUTED'
    };
  }
}

export default new ExecutionQualityEngine();
