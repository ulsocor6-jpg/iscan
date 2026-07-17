// src/controllers/flowerController.js

import crypto                              from "crypto";
import FlowerOrder                         from "../../models/flower/flowerOrderModel.js";
import { getOrCreateRoninDepositAddress }  from "../../services/flower/flowerWalletService.js";
import { getOrCreateBaseDepositAddress }   from "../../services/flower/baseWalletService.js";
import { assertAddressAvailable }          from "../../services/flower/flowerOrderGuard.js";

const CHAIN_CONFIG = {
  ronin: { chainId: "0x7e4",  label: "Ronin Mainnet", getAddress: getOrCreateRoninDepositAddress },
  base:  { chainId: "0x2105", label: "Base Mainnet",  getAddress: getOrCreateBaseDepositAddress },
};

function resolveChain(input) {
  const key = (input || "ronin").toLowerCase();
  if (!CHAIN_CONFIG[key]) {
    throw new Error(`Unsupported chain "${input}". Use "ronin" or "base".`);
  }
  return key;
}

// GET /api/flower/wallet?chain=base|ronin
// Returns the user's deposit address for FLOWER on the requested chain (creates it if needed)
export const getFlowerWallet = async (req, res) => {
  try {
    const chain = resolveChain(req.query.chain);
    const { getAddress, chainId, label } = CHAIN_CONFIG[chain];

    const result = await getAddress(req.user.id);

    res.json({
      success: true,
      wallet: {
        address: result.address,
        chain:   chain.toUpperCase(),
        chainId,
        token:   "FLOWER",
        network: label,
        note:    `Send FLOWER tokens to this address (${label}) to initiate a swap`
      }
    });

  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// POST /api/flower/create
// Body: { expectedAmount: Number, chain: "base" | "ronin" }
export const createOrder = async (req, res) => {
  try {
    const { expectedAmount, chain: chainInput } = req.body;
    const chain = resolveChain(chainInput);
    const { getAddress } = CHAIN_CONFIG[chain];

    if (!expectedAmount || expectedAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "expectedAmount must be a positive number"
      });
    }

    const { address: depositAddress } = await getAddress(req.user.id);

    // Deposit addresses are reused across every order this user creates —
    // refuse a second concurrent order on the same address rather than let
    // two orders race to claim the same incoming deposit.
    await assertAddressAvailable(depositAddress);

    const orderId = "FLW-" + crypto.randomBytes(6).toString("hex");

    const order = await FlowerOrder.create({
      orderId,
      userId:         req.user.id,
      expectedAmount,
      depositAddress,
      chain,
      source:         "GENERIC",
      status:         "WAITING_DEPOSIT"
    });

    res.json({
      success: true,
      order: {
        orderId:        order.orderId,
        depositAddress: order.depositAddress,
        expectedAmount: order.expectedAmount,
        status:         order.status,
        chain:          chain.toUpperCase(),
        token:          "FLOWER",
        note:           `Send exactly ${expectedAmount} FLOWER to this address (${chain.toUpperCase()})`,
        createdAt:      order.createdAt
      }
    });

  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// GET /api/flower/status/:orderId
export const getOrderStatus = async (req, res) => {
  try {
    const order = await FlowerOrder.findOne({
      orderId: req.params.orderId,
      userId:  req.user.id
    });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    res.json({
      success: true,
      order: {
        orderId:        order.orderId,
        status:         order.status,
        depositAddress: order.depositAddress,
        chain:          order.chain,
        expectedAmount: order.expectedAmount,
        receivedAmount: order.receivedAmount,
        usdcReceived:   order.usdcReceived,
        phpAmount:      order.phpAmount,
        feeAmount:      order.feeAmount,
        txHash:         order.txHash,
        swapTxHash:     order.swapTxHash,
        failureReason:  order.failureReason,
        createdAt:      order.createdAt,
        updatedAt:      order.updatedAt
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/flower/confirm
// Manual trigger: { orderId, txHash }
