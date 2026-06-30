export function parseMariBankEmail(text) {
  if (!text) return null;

  // Example extraction patterns (you will refine later)
  const amountMatch = text.match(/PHP\s?([\d,]+\.\d{2})/);
  const refMatch = text.match(/Reference\s?No\:\s?(\w+)/);
  const senderMatch = text.match(/from\s(.+?)\s/);

  if (!amountMatch) return null;

  const senderNameMatch =
  text.match(/From:\s*(.+)/i);

const lastFourMatch =
  text.match(/(\d{4})\s*$/m);

console.log("\n=== MARIBANK PARSER ===");
console.log(text);
console.log("amountMatch=", amountMatch?.[1]);
console.log("senderName=", senderNameMatch?.[1]);
console.log("lastFour=", lastFourMatch?.[1]);

return {
  source: "MARI_BANK",
  amount: parseFloat(amountMatch[1].replace(/,/g, "")),
  referenceId: refMatch?.[1] || null,

  senderName:
    senderNameMatch?.[1]?.trim() || null,

  senderLastFour:
    lastFourMatch?.[1] || null,

  raw: text,
  timestamp: new Date(),
};
}
