// config/katana.js
// Katana DEX router config for Ronin chain.
// Katana is Uniswap V2-compatible.
//
// PATCH: added `transfer` to ERC20_ABI — required by flowerSweepService.js
// which calls flowerToken.transfer(TREASURY_WALLET, balance).

export const KATANA_ROUTER_ABI = [
  {
    inputs: [
      { internalType: "uint256",   name: "amountIn",    type: "uint256"   },
      { internalType: "uint256",   name: "amountOutMin",type: "uint256"   },
      { internalType: "address[]", name: "path",        type: "address[]" },
      { internalType: "address",   name: "to",          type: "address"   },
      { internalType: "uint256",   name: "deadline",    type: "uint256"   }
    ],
    name: "swapExactTokensForTokens",
    outputs: [{ internalType: "uint256[]", name: "amounts", type: "uint256[]" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256",   name: "amountIn", type: "uint256"   },
      { internalType: "address[]", name: "path",     type: "address[]" }
    ],
    name: "getAmountsOut",
    outputs: [{ internalType: "uint256[]", name: "amounts", type: "uint256[]" }],
    stateMutability: "view",
    type: "function"
  }
];

export const ERC20_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "from", type: "address" },
      { indexed: true, internalType: "address", name: "to", type: "address" },
      { indexed: false, internalType: "uint256", name: "value", type: "uint256" }
    ],
    name: "Transfer",
    type: "event"
  },
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount",  type: "uint256" }
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  // ── ADDED: required by flowerSweepService.transfer() ──────────────────────
  {
    inputs: [
      { internalType: "address", name: "to",     type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" }
    ],
    name: "transfer",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function"
  }
];

export const RONIN_TOKENS = {
  FLOWER: process.env.FLOWER_TOKEN,
  USDC:   process.env.USDC_TOKEN  || "0x0b7007c13325c48911f73a2dad5fa5dcbf808adc",
  WRON:   process.env.WRON_TOKEN  || "0xe514d9deb7966c8be0ca922de8a064264ea6bcd4"
};

export const DEFAULT_SLIPPAGE_BPS  = 200;
export const SWAP_DEADLINE_SECONDS = 300;

export default {
  KATANA_ROUTER_ABI,
  ERC20_ABI,
  RONIN_TOKENS,
  DEFAULT_SLIPPAGE_BPS,
  SWAP_DEADLINE_SECONDS
};
