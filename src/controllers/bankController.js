import BankAccount from '../models/BankAccount.js';

export const addBank = async (req, res) => {
  try {

    const {
      bankName,
      accountName,
      accountNumber,
      accountType
    } = req.body;

    if (
      !bankName ||
      !accountName ||
      !accountNumber
    ) {
      return res.status(400).json({
        error: 'Missing fields'
      });
    }

    const existing = await BankAccount.findOne({
      userId: req.user.id,
      accountNumber
    });

    if (existing) {
      return res.status(400).json({
        error: 'Bank account already linked'
      });
    }

    const bank = await BankAccount.create({
      userId: req.user.id,
      bankName,
      accountName,
      accountNumber,
      accountType
    });

    res.json({
      success: true,
      bank
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: 'Failed to add bank'
    });

  }
};

export const getBanks = async (req, res) => {

  try {

    const banks = await BankAccount.find({
      userId: req.user.id
    });

    res.json({
      success: true,
      banks
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: 'Failed to load banks'
    });

  }
};

export const deleteBank = async (req, res) => {

  try {

    const bank = await BankAccount.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!bank) {
      return res.status(404).json({
        error: 'Bank account not found'
      });
    }

    res.json({
      success: true,
      message: 'Bank account removed'
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: 'Failed to remove bank'
    });

  }
};
