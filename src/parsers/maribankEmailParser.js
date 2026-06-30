export function parseMariBankEmail(text) {
  if (!text) return null;

  const amountMatch = text.match(/PHP\s?([\d,]+\.\d{2})/);
  const refMatch    = text.match(/Reference\s?No\:\s?(\w+)/);

  if (!amountMatch) return null;

  const senderNameMatch = text.match(/From:\s*(.+)/i);
  const lastFourMatch   = text.match(/(\d{4})\s*$/m);

  // FIX #10: Removed console.log statements that were printing raw email
  // content (sender names, amounts) to stdout in production.

  return {
    source:        "MARI_BANK",
    amount:        parseFloat(amountMatch[1].replace(/,/g, "")),
    referenceId:   refMatch?.[1] || null,
    senderName:    senderNameMatch?.[1]?.trim() || null,
    senderLastFour: lastFourMatch?.[1] || null,
    raw:           text,
    timestamp:     new Date(),
  };
}
