/**
 * parseMayaNotification
 *
 * Mirrors parseMariBankEmail() in maribankEmailParser.js
 * Input:  { title, text, subText, timestamp, raw }
 * Output: structured transaction object or null
 *
 * Maya push notification formats:
 *
 * INCOMING:
 *   Title: "Money received"
 *   Text:  "You received PHP 500.00 from Juan Dela Cruz. Ref No. 123456789012"
 *
 * OUTGOING:
 *   Title: "Money sent" / "Payment successful"
 *   Text:  "You sent PHP 250.00 to Maria Santos. Ref No. 987654321098"
 *
 * QR PAYMENT:
 *   Title: "Payment successful"
 *   Text:  "PHP 120.00 paid to SM Supermarket. Ref No. 456789012345"
 *
 * CASH IN:
 *   Title: "Add Money successful"
 *   Text:  "PHP 1,000.00 has been added to your Maya wallet."
 */
export function parseMayaNotification({ title, text, subText, timestamp, raw }) {
  const combined = `${title} ${text} ${subText}`.trim();

  if (!combined) return null;

  const amountMatch = combined.match(/PHP\s?([\d,]+\.?\d{0,2})/i);
  if (!amountMatch) return null;

  const amount = parseFloat(amountMatch[1].replace(/,/g, ""));

  const refMatch = combined.match(/Ref(?:erence)?\s?No\.?\s?([A-Z0-9\-]+)/i);
  const referenceId = refMatch?.[1]?.trim() || null;

  const direction = detectDirection(title, text);
  const counterparty = detectCounterparty(text, direction);
  const type = detectType(title, text);

  return {
    source: "MAYA",
    direction,       // "IN" | "OUT" | "UNKNOWN"
    type,            // "TRANSFER" | "PAYMENT" | "CASH_IN" | "UNKNOWN"
    amount,
    referenceId,
    counterparty,
    notifTitle: title,
    notifText: text,
    raw: combined,
    timestamp: timestamp || new Date(),
  };
}

function detectDirection(title, text) {
  const t = `${title} ${text}`.toLowerCase();

  if (
    t.includes("you received") ||
    t.includes("money received") ||
    t.includes("has been added")
  ) return "IN";

  if (
    t.includes("you sent") ||
    t.includes("money sent") ||
    t.includes("payment successful") ||
    t.includes("paid to")
  ) return "OUT";

  return "UNKNOWN";
}

function detectType(title, text) {
  const t = `${title} ${text}`.toLowerCase();

  if (t.includes("add money") || t.includes("cash in") || t.includes("has been added")) return "CASH_IN";
  if (t.includes("paid to") || t.includes("payment successful")) return "PAYMENT";
  if (t.includes("sent") || t.includes("received") || t.includes("transfer")) return "TRANSFER";

  return "UNKNOWN";
}

function detectCounterparty(text, direction) {
  if (!text) return "unknown";

  const fromMatch = text.match(/from\s+(.+?)[\.\,]/i);
  if (fromMatch && direction === "IN") return fromMatch[1].trim();

  const toMatch = text.match(/(?:sent|paid)\s+(?:PHP\s?[\d,\.]+\s+)?to\s+(.+?)[\.\,]/i);
  if (toMatch && direction === "OUT") return toMatch[1].trim();

  return "unknown";
}
