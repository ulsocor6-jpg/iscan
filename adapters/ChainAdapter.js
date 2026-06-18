// adapters/ChainAdapter.js
//
// Contract every chain adapter must satisfy. Generic services (watcher,
// sweep, swap, settlement) only ever call through these methods — they
// never import ethers, ABIs, or chain config directly. Adding a new chain
// means writing a new adapter (or reusing an existing one with new config)
// and registering it in adapters/index.js. Nothing else changes.

export class ChainAdapter {
  constructor(config) {
    if (!config) throw new Error(`${this.constructor.name} requires a config object`);
    this.config = config;
  }

  get chainLabel() {
    return this.config.chainLabel;
  }

  get minConfirmations() {
    return this.config.minConfirmations;
  }

  get platformFeePercent() {
    return this.config.platformFeePercent;
  }

  get depositTokenSymbol() {
    return this.config.depositTokenSymbol;
  }

  // ── Required overrides ──────────────────────────────────────────────────

  /** Returns a cached JsonRpcProvider for this chain. */
  getProvider() {
    throw new Error("getProvider() not implemented");
  }

  /** Returns the deposit-token ERC20 contract (read-only or with a signer). */
  getDepositTokenContract(_signerOrProvider) {
    throw new Error("getDepositTokenContract() not implemented");
  }

  /** Returns the DEX router contract (read-only or with a signer). */
  getRouterContract(_signerOrProvider) {
    throw new Error("getRouterContract() not implemented");
  }

  /** Quote: how much quote-token (USDC) would `amountIn` deposit-token yield. */
  async getQuote(_amountIn) {
    throw new Error("getQuote() not implemented");
  }

  /** Apply slippage tolerance to a raw on-chain quote, returns BigInt floor. */
  calcMinOutput(_amountOutRaw, _slippageBps) {
    throw new Error("calcMinOutput() not implemented");
  }

  /** Executes the swap from treasury wallet, returns the tx receipt. */
  async executeSwap(_params) {
    throw new Error("executeSwap() not implemented");
  }

  /** Reads the quote-token (USDC) amount actually received from a swap receipt. */
  parseQuoteAmountFromReceipt(_receipt) {
    throw new Error("parseQuoteAmountFromReceipt() not implemented");
  }

  /** Derives a deposit address + private key for a given HD index. */
  async deriveDepositAddress(_index) {
    throw new Error("deriveDepositAddress() not implemented");
  }

  /** Sweeps the full deposit-token balance from a user address to treasury. */
  async sweepToTreasury(_params) {
    throw new Error("sweepToTreasury() not implemented");
  }

  /** Scans recent blocks for Transfer events into a given deposit address. */
  async findIncomingTransfer(_params) {
    throw new Error("findIncomingTransfer() not implemented");
  }

  /** Returns { receipt, confirmations } for a given tx hash, or null if not yet mined. */
  async getConfirmationStatus(_txHash) {
    throw new Error("getConfirmationStatus() not implemented");
  }
}

export default ChainAdapter;
