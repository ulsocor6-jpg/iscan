// scripts/check-mnemonic-loaded.js
//
// Confirms HD_WALLET_MNEMONIC is present and roughly well-formed WITHOUT
// ever printing the value itself. Run this from the project root.
//
// Usage: node scripts/check-mnemonic-loaded.js

import dotenv from "dotenv";
const result = dotenv.config();

if (result.error) {
  console.log(`[CHECK] dotenv could not find/read a .env file: ${result.error.message}`);
} else {
  console.log(`[CHECK] .env loaded, ${Object.keys(result.parsed || {}).length} keys found in the file`);
  console.log(`[CHECK] Is HD_WALLET_MNEMONIC one of them? ${Object.prototype.hasOwnProperty.call(result.parsed || {}, "HD_WALLET_MNEMONIC")}`);
}

const val = process.env.HD_WALLET_MNEMONIC;
console.log(`[CHECK] process.env.HD_WALLET_MNEMONIC is set: ${!!val}`);
if (val) {
  const words = val.trim().split(/\s+/);
  console.log(`[CHECK] Word count: ${words.length} (BIP-39 mnemonics are normally 12 or 24 words)`);
  console.log(`[CHECK] First char: "${val[0]}", length: ${val.length}`);
} else {
  console.log("[CHECK] Not set. Check that:");
  console.log("  1. The key in .env is spelled exactly HD_WALLET_MNEMONIC (case-sensitive)");
  console.log("  2. There's no stray quoting/whitespace issue on that line in .env");
  console.log("  3. You're running node from the same directory .env lives in");
  console.log("  4. It's not accidentally in a .env.local or .env.production that this run isn't loading");
}
