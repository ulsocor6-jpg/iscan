const { Wallet } = require('ethers');

function generateWallet() {
  const wallet = Wallet.createRandom();

  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic?.phrase
  };
}

module.exports = {
  generateWallet
};
