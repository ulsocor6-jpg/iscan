const settlementWorker = require("./settlementWorker");
const settlementQueue = require("./settlementQueue");

function startSettlementWorker() {
  settlementQueue.process("finalize-transfer", async (job) => {
    return settlementWorker(job);
  });

  console.log("Settlement worker running");
}

module.exports = { startSettlementWorker };
