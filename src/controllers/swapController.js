import { swapToPHP }
from '../services/swapService.js';

export const swapUSDtoPHP =
async (req, res) => {
  try {

    const {
      amount,
      currency
    } = req.body;

    const result =
      await swapToPHP({
        userId: req.user.id,
        amount: Number(amount),
        fromCurrency: currency
      });

    return res.json({
      success: true,
      data: result
    });

  } catch (err) {

    return res.status(400).json({
      success: false,
      message: err.message
    });

  }
};
