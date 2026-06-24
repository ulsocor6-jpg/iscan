export function applyFees(tx) {
  if (tx.type !== "cashout") {
    return { fee: 0, debit: 0, credit: tx.phpAmount };
  }

  const MARI_FEE = 15;
  const MARGIN = 5;

  const fee = MARI_FEE + MARGIN;

  return {
    fee,
    debit: fee,
    credit: tx.phpAmount - fee,
  };
}
