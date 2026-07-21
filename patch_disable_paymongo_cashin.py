#!/usr/bin/env python3
"""
Guards the PayMongo-backed cashIn route so it returns a clean
"currently unavailable" response instead of hitting PayMongo.

Run from repo root: python3 patch_disable_paymongo_cashin.py
Aborts loudly (no partial writes) if the anchor text isn't found.
"""
import sys

TARGET = "src/controllers/paymentController.js"

OLD = """export const cashIn = async (req, res) => {
  try {
    const { amount } = req.body;
    const phpAmount = parseFloat(amount);

    if (!phpAmount || phpAmount < 20) {
      return res.status(400).json({ error: 'Minimum cash-in is \u20b120.' });
    }
    if (phpAmount > 100000) {
      return res.status(400).json({ error: 'Maximum cash-in is \u20b1100,000.' });
    }"""

NEW = """export const cashIn = async (req, res) => {
  try {
    // PayMongo cash-in is currently unavailable \u2014 only Maya and MariBank
    // are active providers right now. Remove this guard once PayMongo is
    // re-enabled for production use.
    return res.status(503).json({
      error: 'This payment method is currently unavailable. Please use Maya or MariBank.',
      code: 'PROVIDER_UNAVAILABLE',
      provider: 'paymongo',
    });

    const { amount } = req.body;
    const phpAmount = parseFloat(amount);

    if (!phpAmount || phpAmount < 20) {
      return res.status(400).json({ error: 'Minimum cash-in is \u20b120.' });
    }
    if (phpAmount > 100000) {
      return res.status(400).json({ error: 'Maximum cash-in is \u20b1100,000.' });
    }"""

def main():
    with open(TARGET, "r", encoding="utf-8") as f:
        content = f.read()

    if content.count(OLD) == 0:
        print(f"ABORT: anchor text not found in {TARGET}. No changes made.", file=sys.stderr)
        sys.exit(1)
    if content.count(OLD) > 1:
        print(f"ABORT: anchor text matched {content.count(OLD)} times in {TARGET} (expected 1). No changes made.", file=sys.stderr)
        sys.exit(1)

    content = content.replace(OLD, NEW)

    with open(TARGET, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"OK: patched {TARGET}")

if __name__ == "__main__":
    main()
