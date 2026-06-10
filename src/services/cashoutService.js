import Wallet from "../models/walletModel.js";

export async function cashout(
userId,
amount
)
{
    const wallet =
    await Wallet.findOne({userId});

    if(!wallet)
    {
        throw new Error(
        "Wallet not found"
        );
    }

    if(wallet.balance < amount)
    {
        throw new Error(
        "Insufficient balance"
        );
    }

    wallet.balance -= amount;

    await wallet.save();

    return wallet;
}
