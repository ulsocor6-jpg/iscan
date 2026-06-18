// adapters/EvmV2DexAdapter.js
//
// Concrete ChainAdapter for any EVM chain whose DEX speaks the Uniswap V2
// router interface (getAmountsOut / swapExactTokensForTokens). Katana on
// Ronin is V2-compatible, and most Base DEXs you'd realistically use for a
// stablecoin-out swap (BaseSwap, SushiSwap's Base deployment, a vanilla
// Uniswap V2 fork) are too — so the SAME class serves both chains, just
// constructed with different config.
//
// If you end up routing through Aerodrome (Solidly-style, stable/volatile
// pool flag in the route) or Uniswap V3 (quoter + exactInputSingle, fee
// tiers, no getAmountsOut) on Base, that needs a different adapter class —
// the swap call shape genuinely differs. Ping me which DEX you're using and
// I'll add EvmV3DexAdapter / SolidlyDexAdapter alongside this one; the rest
// of the pipeline (watcher/sweep/settlement) doesn't change either way.

import { ethers } from "ethers";
import { ChainAdapter } from "./ChainAdapter.js";

export class EvmV2DexAdapter extends ChainAdapter {
  constructor(config) {
    super(config);
    this._provider = null;
  }

  getProvider() {
    if (!this._provider) {
      this._provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
    }
    return this._provider;
  }

  getDepositTokenContract(signerOrProvider = this.getProvider()) {
    return new ethers.Contract(
      this.config.depositTokenAddress,
      this.config.erc20Abi,
      signerOrProvider
    );
  }

  getQuoteTokenContract(signerOrProvider = this.getProvider()) {
    return new ethers.Contract(
      this.config.quoteTokenAddress,
      this.config.erc20Abi,
      signerOrProvider
    );
  }

  getRouterContract(signerOrProvider = this.getProvider()) {
    return new ethers.Contract(
      this.config.routerAddress,
      this.config.routerAbi,
      signerOrProvider
    );
  }

  getTreasurySigner() {
    if (!this.config.treasuryPrivateKey) {
      throw new Error(`${this.chainLabel}: TREASURY_PRIVATE_KEY not configured`);
    }
    return new ethers.Wallet(this.config.treasuryPrivateKey, this.getProvider());
  }

  async _depositTokenDecimals() {
    if (this.config.depositTokenDecimals != null) return this.config.depositTokenDecimals;
    return await this.getDepositTokenContract().decimals();
  }

  async getQuote(amountIn) {
    const router = this.getRouterContract();
    const decimalsIn = await this._depositTokenDecimals();
    const amountInWei = ethers.parseUnits(amountIn.toString(), decimalsIn);
    const path = [this.config.depositTokenAddress, this.config.quoteTokenAddress];

    const amounts = await router.getAmountsOut(amountInWei, path);
    const amountOutRaw = amounts[1];

    return {
      amountIn,
      amountInWei,
      path,
      amountOutQuote: parseFloat(
        ethers.formatUnits(amountOutRaw, this.config.quoteTokenDecimals)
      ),
      amountOutRaw
    };
  }

  calcMinOutput(amountOutRaw, slippageBps = this.config.slippageBps) {
    const factor = BigInt(10000 - slippageBps);
    return (amountOutRaw * factor) / 10000n;
  }

  async executeSwap({ amountInWei, minOutputRaw, path }) {
    const signer = this.getTreasurySigner();
    const router = this.getRouterContract(signer);
    const depositToken = this.getDepositTokenContract(signer);
    const deadline = Math.floor(Date.now() / 1000) + this.config.deadlineSeconds;

    const approveTx = await depositToken.approve(this.config.routerAddress, amountInWei);
    await approveTx.wait();

    const swapTx = await router.swapExactTokensForTokens(
      amountInWei,
      minOutputRaw,
      path,
      signer.address, // quote token lands in treasury wallet
      deadline
    );

    return await swapTx.wait();
  }

  parseQuoteAmountFromReceipt(receipt) {
    const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
    const target = this.config.quoteTokenAddress.toLowerCase();

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === target && log.topics[0] === TRANSFER_TOPIC) {
        const value = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], log.data)[0];
        return parseFloat(ethers.formatUnits(value, this.config.quoteTokenDecimals));
      }
    }

    throw new Error(
      `[${this.chainLabel}] Could not parse quote-token amount from swap receipt`
    );
  }

  async deriveDepositAddress(index) {
    return await this.config.deriveAddress(index);
  }

  async sweepToTreasury({ depositAddress, privateKey }) {
    const provider = this.getProvider();
    const signer = new ethers.Wallet(privateKey, provider);
    const token = this.getDepositTokenContract(signer);

    const balance = await token.balanceOf(depositAddress);
    if (balance === 0n) {
      throw new Error(`[${this.chainLabel}] No ${this.depositTokenSymbol} balance at ${depositAddress}`);
    }

    const decimals = await this._depositTokenDecimals();
    const humanAmount = parseFloat(ethers.formatUnits(balance, decimals));

    const tx = await token.transfer(this.config.treasuryWallet, balance);
    const receipt = await tx.wait();

    return { txHash: receipt.hash, amount: humanAmount };
  }

  async findIncomingTransfer({ depositAddress, fromBlock, toBlock }) {
    const token = this.getDepositTokenContract();
    const filter = token.filters.Transfer(null, depositAddress);
    const events = await token.queryFilter(filter, fromBlock, toBlock);

    if (events.length === 0) return [];

    const decimals = await this._depositTokenDecimals();

    return events.map((event) => ({
      amount: parseFloat(ethers.formatUnits(event.args[2], decimals)),
      txHash: event.transactionHash
    }));
  }

  async getConfirmationStatus(txHash) {
    const provider = this.getProvider();
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) return null;

    const currentBlock = await provider.getBlockNumber();
    return {
      receipt,
      confirmations: currentBlock - receipt.blockNumber
    };
  }
}

export default EvmV2DexAdapter;
