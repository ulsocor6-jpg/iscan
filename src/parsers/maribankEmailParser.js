export function parseMariBankEmail(text) {
  if (!text) return null;
  const amountMatch = text.match(/PHP\s?([\d,]+\.\d{2})/);
  const refMatch    = text.match(/Reference\s?No\:\s?(\w+)/);
  if (!amountMatch) return null;

  const senderNameMatch = text.match(/From:\s*(.+)/i);

  // FIX: Previous regex /(\d{4})\s*$/m required the 4 digits to be the
  // very last characters (only whitespace after) — this fails on real
  // text like "...account ending 8741." because of the trailing period.
  // It also only matched an ambiguous "last 4 digits anywhere at end of
  // line" rather than actually anchoring to an account-number phrase,
  // which is fragile against unrelated trailing numbers.
  //
  // This pattern matches common phrasings from both the email format
  // ("Account No. ****8741") and the Android notification format
  // ("with account ending 8741"), regardless of trailing punctuation.
  const lastFourMatch = text.match(
    /account\s*(?:no\.?|number|ending)?\s*[:#*]*\s*(\d{4})\b/i
  );

  const lastFour = lastFourMatch?.[1] || null;

  // FIX: processTransaction.js destructures `recipientLastFour` for the
  // MARI_BANK branch of USER_LOOKUP, but this parser only ever produced
  // `senderLastFour` — so recipientLastFour was always undefined and
  // USER_LOOKUP failed with UNIDENTIFIABLE_RECIPIENT on every single
  // MariBank deposit, regardless of source (email or Android). This is
  // the actual field the lookup needs; senderLastFour is kept too for
  // backward compatibility with any other code that may read it.
  return {
    source:            "MARI_BANK",
    amount:            parseFloat(amountMatch[1].replace(/,/g, "")),
    referenceId:       refMatch?.[1] || null,
    senderName:        senderNameMatch?.[1]?.trim() || null,
    senderLastFour:    lastFour,
    recipientLastFour: lastFour,
    raw:               text,
    timestamp:         new Date(),
  };
}
