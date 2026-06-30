import Treasury from "../models/treasuryModel.js";

async function getOrCreate(asset) {
  let treasury = await Treasury.findOne({ asset });

  if (!treasury) {
    treasury = await Treasury.create({
      asset,
      balance: 0,
      reserved: 0,
    });
  }

  return treasury;
}

async function credit({ asset, amount }) {
  const treasury = await getOrCreate(asset);

  treasury.balance += amount;
  treasury.updatedAt = new Date();

  await treasury.save();

  return treasury;
}

async function debit({ asset, amount }) {
  const treasury = await getOrCreate(asset);

  if (treasury.balance < amount) {
    throw new Error(
      `Insufficient ${asset} treasury balance (${treasury.balance})`
    );
  }

  treasury.balance -= amount;
  treasury.updatedAt = new Date();

  await treasury.save();

  return treasury;
}

async function getBalance(asset) {
  const treasury = await getOrCreate(asset);
  return treasury.balance;
}

export default {
  credit,
  debit,
  getBalance,
};
