// src/services/support/llmSupportService.js
//
// Calls the Anthropic API to answer a user's question about ONE specific,
// already-resolved transaction record. The LLM never picks which record
// to discuss — that's resolved deterministically (regex + ownership-scoped
// DB lookup) before this is ever called. The LLM also never moves money
// directly: it can only request an action via a structured marker, which
// the caller executes through the existing fund-safety-gated functions.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.SUPPORT_LLM_MODEL || "claude-sonnet-5";
const MAX_TOKENS = 400;

function buildSystemPrompt(record, recordType) {
  return `You are a support assistant inside ISCAN, a fintech app. You are answering questions about exactly ONE transaction — its real data is given below as JSON. Do not discuss any other transaction, even if asked.

RULES:
- Only state facts present in the JSON below. Never invent amounts, dates, statuses, fees, or reasons.
- Be concise and warm — a sentence or two unless the user genuinely needs more.
- If the user asks to retry this transaction AND "canRetry" is true in the data, end your reply with exactly [ACTION:RETRY] on its own, after your normal reply text. Do not claim it already succeeded — the system will confirm separately once it actually runs.
- If the user asks to cancel/close this transaction AND "canCancel" is true, end your reply with exactly [ACTION:CANCEL] the same way.
- If canRetry or canCancel is false and the user asks for that action anyway, explain briefly why not (based on its current status) — never emit an action marker in that case.
- If asked something the data doesn't cover, say you don't have that information rather than guessing.

TRANSACTION DATA (${recordType}):
${JSON.stringify(record, null, 2)}`;
}

export async function askSupportAssistant({ record, recordType, history, userMessage }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const messages = [
    ...(history || []).map((h) => ({
      role: h.role === "assistant" ? "assistant" : "user",
      content: h.text,
    })),
    { role: "user", content: userMessage },
  ];

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: buildSystemPrompt(record, recordType),
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const rawText = (data.content || [])
    .map((block) => block.text || "")
    .join("")
    .trim();

  const actionMatch = rawText.match(/\[ACTION:(RETRY|CANCEL)\]\s*$/);
  const action = actionMatch ? actionMatch[1] : null;
  const text = actionMatch ? rawText.slice(0, actionMatch.index).trim() : rawText;

  return { text, action };
}
