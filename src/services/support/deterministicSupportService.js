// src/services/support/deterministicSupportService.js
//
// No LLM. Pure rule-based response generation from an already-resolved
// record. Keyword intent detection only decides WHICH canned message to
// return — it never decides whether an action is allowed. That's always
// gated by canRetry/canCancel from the record itself.
//
// Intent matchers run in order and the FIRST match wins (checked before
// the generic status fallback), so a question like "why did it fail?"
// gets the failReason specifically instead of the same summary blob
// every other question would also get.

const RETRY_RE = /\bretry\b/i;
const CANCEL_RE = /\bcancel\b|\bclose\b|\bclose\s*out\b/i;

function formatDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

// Each matcher: { test: RegExp, answer: (record) => string | null }
// Returning null means "I recognized the question but don't have that
// data for this record" — falls through to the next matcher rather than
// silently answering wrong.
const INTENT_MATCHERS = [
  {
    test: /\bexpir|deadline|how long|when.*(does|will).*expire\b/i,
    answer: (r) => {
      const formatted = formatDate(r.expiresAt);
      if (!formatted) return null;
      return `This expires on ${formatted}.`;
    },
  },
  {
    test: /\bfee|charge|cost\b/i,
    answer: (r) => {
      if (r.fee === undefined || r.fee === null) return null;
      return `The fee on this one is ${r.fee}${r.asset ? ` ${r.asset}` : ""}.`;
    },
  },
  {
    test: /\bhow much|amount|net\b/i,
    answer: (r) => {
      if (r.amount === undefined) return null;
      const net = r.netAmount !== undefined && r.netAmount !== r.amount
        ? ` (net after fees: ${r.netAmount})`
        : "";
      return `Amount: ${r.amount}${r.asset ? ` ${r.asset}` : ""}${net}.`;
    },
  },
  {
    test: /\bwhy\b|\breason\b|what happened/i,
    answer: (r) => {
      if (r.failReason) return `Reason: ${r.failReason}`;
      if (r.status === "rejected" || r.status === "failed") {
        return `It's currently "${r.status}", but I don't have a specific reason recorded for this one.`;
      }
      return null;
    },
  },
  {
    test: /\bdestination|where.*(sent|going)|account number|wallet address\b/i,
    answer: (r) => {
      if (!r.destination) return null;
      return `Destination: ${r.destination}.`;
    },
  },
  {
    test: /\btx hash|transaction hash|txid|on.?chain\b/i,
    answer: (r) => {
      if (!r.txHash) return "No transaction hash yet — it hasn't been sent on-chain.";
      return `Transaction hash: ${r.txHash}`;
    },
  },
  {
    test: /\bwhen.*(created|submitted|start|request)/i,
    answer: (r) => {
      const formatted = formatDate(r.createdAt);
      if (!formatted) return null;
      return `This was created on ${formatted}.`;
    },
  },
  {
    test: /\bstatus\b|what'?s (going on|happening)|update/i,
    answer: (r) => r.summary || `Status: ${r.status}.`,
  },
];

export function generateSupportResponse({ record, recordType, userMessage, investigationState }) {
  if (investigationState === "UNDER_REVIEW") {
    return {
      text: "I want to double-check something on your account before I confirm anything about this — " +
            "it's already flagged for a closer look, so I'd rather not guess. This should be resolved soon; " +
            "you don't need to retry anything in the meantime.",
      action: null,
    };
  }

  const msg = userMessage || "";
  const wantsRetry = RETRY_RE.test(msg);
  const wantsCancel = CANCEL_RE.test(msg);

  let text = "";

  if (recordType === "WITHDRAWAL" && record.nameMismatch) {
    text += `This one's on hold because the receiving account name ("${record.accountName}") ` +
            `doesn't match the name on your account. The team reviews these manually before releasing funds — ` +
            `if that name is correct (e.g. a spouse or family member's account), let support know so it can be verified. `;
  }

  // Try to answer the actual question asked, not just the generic status.
  let matchedAnswer = null;
  for (const matcher of INTENT_MATCHERS) {
    if (matcher.test.test(msg)) {
      matchedAnswer = matcher.answer(record);
      if (matchedAnswer) break;
    }
  }

  text += matchedAnswer || record.summary || `Status: ${record.status}.`;

  let action = null;

  if (wantsRetry) {
    if (record.canRetry) {
      action = "RETRY";
    } else {
      text += ` I can't retry this one automatically right now — it's currently "${record.status}".`;
    }
  } else if (wantsCancel) {
    if (record.canCancel) {
      action = "CANCEL";
    } else {
      text += ` I can't cancel this one from here — it's currently "${record.status}".`;
    }
  }

  return { text: text.trim(), action };
}
