import transakProvider from '../integrations/paymentProviders/transakProvider.js';
import Transaction from '../models/transactionModel.js';
import Wallet from '../models/walletModel.js';

export const createOnrampOrder = async (req, res) => {
  try {
    const { fiatAmount, productId } = req.body;
    const userId = req.user.id;

    const wallet = await Wallet.findOne({ userId });

    if (!wallet || !wallet.walletAddress) {
      return res.status(400).json({
        error: 'Connect MetaMask first'
      });
    }

    const tx = await Transaction.create({
      userId,
      type: 'onramp',
      amount: Number(fiatAmount),
      status: 'ONRAMP_PENDING',
      productId
    });

    const providerResponse = await transakProvider.createOrder({
      userId,
      walletAddress: wallet.walletAddress,
      fiatAmount
    });

    const { orderId, paymentUrl, referenceId } = providerResponse;

    await Transaction.findByIdAndUpdate(
      tx._id,
      {
        referenceId,
        orderId
      }
    );

    return res.json({
      success: true,
      paymentUrl,
      orderId,
      transactionId: tx._id
    });
  } catch (err) {
    console.error('[ONRAMP ERROR]', err);

    return res.status(500).json({
      error: err.message
    });
  }
};
