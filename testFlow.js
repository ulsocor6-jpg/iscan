import processTransaction from "./src/core/processTransaction.js";

async function run() {
  const result = await processTransaction({
    userId: "000000000000000000000001",
    type: "deposit",
    source: "MARI_BANK",
    amount: 1000,
    currency: "FLOWER",
    referenceId: "REF_TEST_001"
  });

  console.log("LEDGER RESULT:");
  console.log(result);
}

run().catch(console.error);
