export const transfer = async (req, res) => {
  try {
    const {
      fromWalletId,
      toWalletId,
      amount,
      referenceId
    } = req.body;

    // ==============================
    // 1. BASIC VALIDATION (MANDATORY)
    // ==============================
    if (!fromWalletId || !toWalletId) {
      return res.status(400).json({
        success: false,
        message: "Wallet IDs are required"
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount"
      });
    }

    if (fromWalletId === toWalletId) {
      return res.status(400).json({
        success: false,
        message: "Cannot transfer to same wallet"
      });
    }

    // ==============================
    // 2. IDEMPOTENCY KEY (CRITICAL)
    // prevents double spending if request retries
    // ==============================
    const txRef =
      referenceId || crypto.randomUUID();

    // ==============================
    // 3. WALLET EXISTENCE CHECK
    // ==============================
    const fromWallet = await Wallet.findById(fromWalletId);
    const toWallet = await Wallet.findById(toWalletId);

    if (!fromWallet || !toWallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found"
      });
    }

    // ==============================
    // 4. BUSINESS RULE CHECK
    // ==============================
    if (fromWallet.balance < amount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient funds"
      });
    }

    // ==============================
    // 5. CALL TRANSACTION ENGINE
    // ==============================
    const result = await TransactionService.transfer({
      fromWalletId,
      toWalletId,
      amount,
      referenceId: txRef
    });

    // ==============================
    // 6. SUCCESS RESPONSE
    // ==============================
    return res.status(200).json({
      success: true,
      message: "Transfer completed successfully",
      referenceId: txRef,
      data: result
    });

  } catch (err) {

    // ==============================
    // 7. ERROR HANDLING
    // ==============================
    return res.status(500).json({
      success: false,
      message: "Transfer failed",
      error: err.message
    });
  }
};
