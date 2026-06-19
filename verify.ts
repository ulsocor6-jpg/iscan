import { HDNodeWallet, Mnemonic } from "ethers";

const mnemonic = "your twelve or twenty four words here";
const targetAddress = "0x9b3E933add3144088c6729de2C82DD38194db12F";

const mn = Mnemonic.fromPhrase(mnemonic);

for (let i = 0; i < 50; i++) {
  const wallet = HDNodeWallet.fromMnemonic(mn, `m/44'/60'/0'/0/${i}`);
  if (wallet.address.toLowerCase() === targetAddress.toLowerCase()) {
    console.log(`✅ MATCH at index ${i}`);
    console.log("Private key:", wallet.privateKey);
    process.exit(0);
  }
}
console.log("❌ No match found in first 50 indexes");
