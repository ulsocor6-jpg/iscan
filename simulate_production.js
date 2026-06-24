// simulate_production.js
// Self-contained simulation of ISCAN's cash-in / cash-out / flower swap flow.
// No real DB — an in-memory ledger array replicates Ledger.create() calls
// exactly as they happen in your real services, using the real math from
// flowerUsdtSwapService.js, paymentController.js, and paymentRoutes.js.
//
// Goal: replay a realistic sequence of user activity and compare
//   (a) the CURRENT buggy "available balance" check (currency-blind)
//   (b) the FIXED currency-scoped check
// to show exactly how unstable (a) is, and confirm (b) is stable.

const ledger = []; // { currency, credit, debit, type, ref }

function post(currency, credit, debit, type) {
  ledger.push({ currency, credit, debit, type });
}

// ---- Replicate getLedgerBalance from paymentRoutes.js ----
function buggyBalance(_userId) {
  // NO currency filter — sums every currency together (the actual live bug)
  return ledger.reduce((sum, e) => sum + e.credit - e.debit, 0);
}
function fixedBalance(currency) {
  return ledger
    .filter(e => e.currency === currency)
    .reduce((sum, e) => sum + e.credit - e.debit, 0);
}

// ---- Replicate flower swap math from flowerUsdtSwapService.js ----
const PLATFORM_FEE = 0.02;
const SPREAD = 0.015;

function flowerToUsdt(amount, rate) {
  const gross = amount * rate;
  const fee = gross * PLATFORM_FEE;
  const usdtOut = +(gross * (1 - SPREAD) - fee).toFixed(6);
  post("FLOWER", 0, amount, "swap-debit");
  post("USDT", usdtOut, 0, "swap-credit");
  return usdtOut;
}
function usdtToFlower(amount, rate) {
  const gross = amount / rate;
  const fee = gross * PLATFORM_FEE;
  const flowerOut = +(gross * (1 - SPREAD) - fee).toFixed(4);
  post("USDT", 0, amount, "swap-debit");
  post("FLOWER", flowerOut, 0, "swap-credit");
  return flowerOut;
}

// ---- Replicate cashIn / webhook credit from paymentController.js ----
function cashIn(phpAmount) {
  post("PHP", phpAmount, 0, "cashin");
}

// ---- Replicate cashout from paymentRoutes.js ----
// useBuggyCheck = true reproduces the live bug; false uses the fix.
function cashOut(phpAmount, useBuggyCheck) {
  const fee = +(phpAmount * 0.015).toFixed(2);
  const total = phpAmount + fee;
  const bal = useBuggyCheck ? buggyBalance() : fixedBalance("PHP");

  if (bal < total) {
    return { success: false, error: `Insufficient balance. Available: ₱${bal.toFixed(2)}, needed: ₱${total.toFixed(2)}` };
  }
  post("PHP", 0, total, "cashout");
  return { success: true, total, availableAtCheckTime: bal };
}

// ============================================================
// SIMULATE a realistic session: cash-in, several flower swaps
// (price moves each time, like the real CoinGecko/Katana feed),
// then a user tries to cash out ₱100.
// ============================================================

console.log("=== STEP 1: Cash in ₱500 ===");
cashIn(500);
console.log("PHP balance (fixed, correct):", fixedBalance("PHP").toFixed(2));
console.log("Blended balance (buggy):     ", buggyBalance().toFixed(2));

console.log("\n=== STEP 2: User buys FLOWER with USDT, then swaps back and forth ===");
// Give user some USDT first (e.g. from a prior top-up)
post("USDT", 10, 0, "cashin-usdt");

const swapLog = [];
let simulatedRate = 0.0712; // starting rate, like the hardcoded fallback

for (let i = 0; i < 6; i++) {
  // Simulate the rate moving around like a live feed would
  simulatedRate = +(simulatedRate * (1 + (Math.random() - 0.5) * 0.08)).toFixed(6);

  if (i % 2 === 0) {
    const out = usdtToFlower(2, simulatedRate);
    swapLog.push(`Swap ${i + 1}: 2 USDT → ${out} FLOWER @ rate ${simulatedRate}`);
  } else {
    const out = flowerToUsdt(15, simulatedRate);
    swapLog.push(`Swap ${i + 1}: 15 FLOWER → ${out} USDT @ rate ${simulatedRate}`);
  }

  console.log(
    swapLog[swapLog.length - 1].padEnd(48),
    "| PHP (fixed):", fixedBalance("PHP").toFixed(2).padStart(8),
    "| Blended (buggy):", buggyBalance().toFixed(2).padStart(8)
  );
}

console.log("\n=== STEP 3: User tries to cash out ₱100 ===");
console.log("Real PHP balance available:", fixedBalance("PHP").toFixed(2));

const resultBuggy = cashOut(100, /* useBuggyCheck */ true);
console.log("\n[BUGGY CHECK RESULT]", resultBuggy);

// Reset: undo that attempted post if it succeeded wrongly, to test the fixed path cleanly
if (resultBuggy.success) {
  // roll back to test fixed check on the same state
  post("PHP", resultBuggy.total, 0, "test-rollback");
}

const resultFixed = cashOut(100, /* useBuggyCheck */ false);
console.log("[FIXED CHECK RESULT] ", resultFixed);

// ============================================================
// STABILITY TEST — run many random swap cycles, track variance
// of the buggy blended number vs the fixed PHP-only number while
// ZERO PHP activity happens. A stable PHP balance should not move
// at all during pure FLOWER/USDT activity.
// ============================================================

console.log("\n=== STABILITY TEST: 200 random flower/USDT swaps, NO PHP activity ===");
const phpSnapshotsFixed = [];
const blendedSnapshotsBuggy = [];

let rate = 0.0712;
// give a cushion of USDT/FLOWER so swaps don't throw on insufficient balance
post("USDT", 500, 0, "test-seed");
post("FLOWER", 500, 0, "test-seed");

for (let i = 0; i < 200; i++) {
  rate = Math.max(0.001, +(rate * (1 + (Math.random() - 0.5) * 0.1)).toFixed(6));
  if (Math.random() > 0.5) {
    usdtToFlower(1 + Math.random() * 3, rate);
  } else {
    flowerToUsdt(5 + Math.random() * 20, rate);
  }
  phpSnapshotsFixed.push(fixedBalance("PHP"));
  blendedSnapshotsBuggy.push(buggyBalance());
}

const variance = arr => {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
};

console.log("PHP balance (fixed) min/max during pure FLOWER/USDT activity:",
  Math.min(...phpSnapshotsFixed).toFixed(2), "/", Math.max(...phpSnapshotsFixed).toFixed(2),
  "(variance:", variance(phpSnapshotsFixed).toFixed(6), ") — should be ZERO movement");

console.log("Blended balance (buggy) min/max during the SAME activity:    ",
  Math.min(...blendedSnapshotsBuggy).toFixed(2), "/", Math.max(...blendedSnapshotsBuggy).toFixed(2),
  "(variance:", variance(blendedSnapshotsBuggy).toFixed(6), ") — fluctuates from unrelated currency activity");

console.log("\nConclusion: the fixed, currency-scoped balance is provably stable (zero variance)");
console.log("under FLOWER/USDT swap load, while the buggy blended check moves continuously —");
console.log("matching exactly the 'violently fluctuating' symptom you reported.");
