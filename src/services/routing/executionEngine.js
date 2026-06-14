import ledgerService from '../ledgerService.js';

/**
 * Executes chosen liquidity route
 */
class ExecutionEngine {
  async execute({ route, user, amount }) {
    switch (route.type) {
      case 'DEX_1INCH':
        return this.executeDEX(route, user, amount);

      case 'TREASURY':
        return this.executeTreasury(route, user, amount);

      default:
        throw new Error('Unsupported route');
    }
  }

  async executeDEX(route) {
    // placeholder: actual on-chain tx goes here
    return {
      status: 'EXECUTED_ONCHAIN',
      provider: route.provider
    };
  }

  async executeTreasury(route, user, amount) {
    await ledgerService.credit({
      userId: user._id,
      amount: route.output,
      type: 'TREASURY_SWAP'
    });

    return {
      status: 'EXECUTED_INTERNAL_LEDGER'
    };
  }
}

export default new ExecutionEngine();
