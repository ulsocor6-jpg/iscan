// src/controllers/flower/flowerUsdtController.js

import {
  quoteFlowerUsdt,
  settleFlowerToUsdt,
  settleUsdtToFlower,
} from "../../services/flower/flowerUsdtSwapService.js";

// GET /api/flower/usdt/quote?fromCurrency=FLOWER&toCurrency=USDT&amount=100
export async function quoteFlowerUsdtSwap(req, res) {
  try {
    const { fromCurrency, toCurrency, amount } = req.query;
    if (!fromCurrency || !toCurrency || !amount)
      return res.status(400).json({ error: "fromCurrency, toCurrency, amount required" });

    const valid = ["FLOWER", "USDC"];
    if (!valid.includes(fromCurrency) || !valid.includes(toCurrency) || fromCurrency === toCurrency)
      return res.status(400).json({ error: "fromCurrency and toCurrency must be FLOWER and USDT" });

    const quote = await quoteFlowerUsdt({ fromCurrency, toCurrency, amount: parseFloat(amount) });
    res.json(quote);
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
}

// POST /api/flower/usdt/swap
// Body: { fromCurrency, toCurrency, amount }
export async function executeFlowerUsdtSwap(req, res) {
  try {
    const { fromCurrency, toCurrency, amount, chain } = req.body;
    const userId = req.user.id;

    if (!fromCurrency || !toCurrency || !amount)
      return res.status(400).json({ error: "fromCurrency, toCurrency, amount required" });

    let result;
    if (fromCurrency === "FLOWER" && toCurrency === "USDC") {
      result = await settleFlowerToUsdt({ userId, amount: parseFloat(amount) });
    } else if (fromCurrency === "USDC" && toCurrency === "FLOWER") {
      result = await settleUsdtToFlower({ userId, amount: parseFloat(amount), chain: chain || "BASE" });
    } else {
      return res.status(400).json({ error: "Only FLOWER↔USDC supported on this endpoint" });
    }

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
