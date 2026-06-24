export function parseMariBankEmail(text) {
  if (!text) return null;

  // Example extraction patterns (you will refine later)
  const amountMatch = text.match(/PHP\s?([\d,]+\.\d{2})/);
  const refMatch = text.match(/Reference\s?No\:\s?(\w+)/);
  const senderMatch = text.match(/from\s(.+?)\s/);

  if (!amountMatch) return null;

  return {
    source: "MARI_BANK",
    amount: parseFloat(amountMatch[1].replace(/,/g, "")),
    referenceId: refMatch?.[1] || null,
    sender: senderMatch?.[1] || "unknown",
    raw: text,
    timestamp: new Date(),
  };
}
