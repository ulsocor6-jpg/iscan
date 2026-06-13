import { ethers } from 'ethers';

const ETH_RPC =
  process.env.ETH_RPC_URL ||
  'https://ethereum.publicnode.com';

export async function scanDeposits() {
  try {
    const provider = new ethers.JsonRpcProvider(
      ETH_RPC
    );

    const blockNumber =
      await provider.getBlockNumber();

    console.log(
      `[SCANNER] Latest block ${blockNumber}`
    );

    return {
      success: true,
      blockNumber
    };

  } catch (err) {
    console.error('[SCANNER]', err);

    return {
      success: false,
      error: err.message
    };
  }
}
