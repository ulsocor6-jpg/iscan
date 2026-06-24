import BankAccount from '../models/BankAccount.js';

export const addBank = async (req, res) => {
  try {
    const { provider = 'bank', bankName, accountName, accountNumber } = req.body;
    if (!accountName || !accountNumber) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    if (provider === 'bank' && !bankName) {
      return res.status(400).json({ error: 'bankName required for bank accounts' });
    }
    const existing = await BankAccount.findOne({ userId: req.user.id, provider, accountNumber });
    if (existing) return res.status(400).json({ error: 'Account already linked' });

    const isFirst = (await BankAccount.countDocuments({ userId: req.user.id })) === 0;
    const bank = await BankAccount.create({
      userId: req.user.id, provider, bankName, accountName, accountNumber,
      isDefault: isFirst
    });
    res.json({ success: true, bank });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add account' });
  }
};

export const getBanks = async (req, res) => {
  try {
    const banks = await BankAccount.find({ userId: req.user.id }).sort({ isDefault: -1, createdAt: -1 });
    res.json({ success: true, banks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load accounts' });
  }
};

export const deleteBank = async (req, res) => {
  try {
    const bank = await BankAccount.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!bank) return res.status(404).json({ error: 'Account not found' });
    res.json({ success: true, message: 'Account removed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove account' });
  }
};

export const setDefaultBank = async (req, res) => {
  try {
    const { id } = req.params;
    const owned = await BankAccount.findOne({ _id: id, userId: req.user.id });
    if (!owned) return res.status(404).json({ error: 'Account not found' });
    await BankAccount.updateMany({ userId: req.user.id }, { isDefault: false });
    owned.isDefault = true;
    await owned.save();
    res.json({ success: true, bank: owned });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to set default' });
  }
};
