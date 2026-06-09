class RoutingEngine {

  async getRoute(
    sourceAsset,
    destinationAsset,
    amount
  ) {

    if (
      sourceAsset === 'USDC' &&
      destinationAsset === 'PHP'
    ) {

      return {

        route:
          'stablecoin_to_bank',

        estimatedFee:
          0.50,

        amount

      };

    }

    return {

      route:
        'internal',

      estimatedFee:
        0.10,

      amount

    };

  }

}

export default new RoutingEngine();
