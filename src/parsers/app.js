/**
 * parseMayaNotification
 *
 * Mirrors parseMariBankEmail() in maribankEmailParser.js
 * Input:  { title, text, subText, timestamp, raw }
 * Output: structured transaction object or null
 *
 * REAL Maya push notification formats (confirmed from device):
 *
 * Maya-to-Maya (direct):
 *   Title: "Received from +639269490763"
 *   Text:  "You have received P1,210.00 from +639269490763 into your wallet."
 *   → senderPhone: "+639269490763"
 *
 * InstaPay (bank/MariBank to Maya):
 *   Title: "Received from MariBank Philippines, Inc. (A Rural Bank)"
 *   Text:  "You received 5.00 from RAUL ANINO ROCO using MariBank Philippines,
 *           Inc. (A Rural Bank) account ending in 7726 via InstaPay."
 *   → senderName: "RAUL ANINO ROCO", senderLastFour: "7726"
 *
 * OUTGOING (we ignore these — only IN matters for deposit matching):
 *   Text:  "You transferred P970.00 to MariBank ... account ending in 7726 via InstaPay."
 *   Text:  "You transferred P280.00 to G-Xchange Inc. / GCash account ending in CPPC via InstaPay."
 */
export function parseMayaNotification({ title, text, subText, timestamp }) {
  const combined = `${title || ""} ${text || ""} ${subText || ""}`.trim();
  if (!combined) return null;

  // ── Only process INCOMING transfers ──────────────────────────────────────
  // We never want to auto-credit based on an outgoing notification
  const direction = detectDirection(title, text);
  if (direction !== "IN") return null;

  // ── Amount ────────────────────────────────────────────────────────────────
  // Handles both "PHP 1,210.00" and "P1,210.00" and "1,210.00" formats
  const amountMatch = combined.match(/(?:PHP|P)\s?([\d,]+\.?\d{0,2})/i)
                   || combined.match(/([\d,]+\.\d{2})/);
  if (!amountMatch) return null;
  const amount = parseFloat(amountMatch[1].replace(/,/g, ""));
  if (!amount || amount <= 0) return null;

  // ── Sender identification (two formats) ──────────────────────────────────

  // Format 1: Maya-to-Maya — phone number present
  // "You have received P1,210.00 from +639269490763 into your wallet."
  const phoneMatch = combined.match(/from\s+(\+63\d{10}|\+63\d{9}|09\d{9})/i);
  const senderPhone = phoneMatch ? normalizePhone(phoneMatch[1]) : null;

  // Format 2: InstaPay — sender name + account last 4
  // "You received 5.00 from RAUL ANINO ROCO using MariBank ... account ending in 7726"
  let senderName = null;
  let senderLastFour = null;

  if (!senderPhone) {
    const nameMatch = combined.match(/from\s+([A-Z][A-Z\s]+?)\s+using\s/i);
    if (nameMatch) senderName = nameMatch[1].trim();

    const lastFourMatch = combined.match(/account\s+ending\s+in\s+([A-Z0-9]+)/i);
    if (lastFourMatch) senderLastFour = lastFourMatch[1].trim();
  }

  // If we can't identify the sender at all, flag it — don't guess
  if (!senderPhone && !senderName) return null;

  return {
    source: "MAYA",
    direction: "IN",
    type: detectType(title, text),
    amount,
    senderPhone,      // "+639269490763" for Maya-to-Maya, null for InstaPay
    senderName,       // "RAUL ANINO ROCO" for InstaPay, null for Maya-to-Maya
    senderLastFour,   // "7726" for InstaPay, null for Maya-to-Maya
    notifTitle: title,
    notifText: text,
    raw: combined,
    timestamp: timestamp ? new Date(timestamp) : new Date(),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function detectDirection(title, text) {
  const t = `${title || ""} ${text || ""}`.toLowerCase();

  if (
    t.includes("you received") ||
    t.includes("you have received") ||
    t.includes("received from") ||
    t.includes("has been added") ||
    t.includes("money received")
  ) return "IN";

  if (
    t.includes("you transferred") ||
    t.includes("you sent") ||
    t.includes("money sent") ||
    t.includes("bank transfer to") ||
    t.includes("payment successful") ||
    t.includes("paid to")
  ) return "OUT";

  return "UNKNOWN";
}

function detectType(title, text) {
  const t = `${title || ""} ${text || ""}`.toLowerCase();
  if (t.includes("instapay"))                                   return "INSTAPAY";
  if (t.includes("add money") || t.includes("has been added")) return "CASH_IN";
  if (t.includes("paid to") || t.includes("payment"))          return "PAYMENT";
  return "TRANSFER";
}

// Normalize "+639269490763" and "09269490763" to the same format "09269490763"
// so it matches how users register their Maya number in linkedWallets
function normalizePhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("63") && digits.length === 12) return "0" + digits.slice(2);
  return digits; // already 09XXXXXXXXX
}
