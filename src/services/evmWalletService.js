const brainBus = require("../../brainbus/brainBus.js");
const { Wallet } = require('ethers');

function generateWallet() {
  const wallet = Wallet.createRandom();
  brainBus.emit("wallet.generated", { address: wallet.address });

  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic?.phrase
  };
}

module.exports = {
  generateWallet
};
