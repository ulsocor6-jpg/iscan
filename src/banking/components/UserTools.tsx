import { useState, useRef, useEffect } from "react";
import "./UserTools.css";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
};

type LookupResult = {
  success: boolean;
  message?: string;
  summary?: string;
  canRetry?: boolean;
  canCancel?: boolean;
  stuck?: boolean;
  withdrawal?: {
    reference: string;
    status: string;
    asset?: string;
    amount?: number;
  };
};

const WELCOME: Message = {
  id: "welcome",
  role: "assistant",
  text: "Hi — I'm here to help with your deposits, withdrawals, and swaps. " +
        "Give me a reference number (like WD-abc123 or CO-abc123) and I'll look it up.",
  createdAt: Date.now(),
};

// Matches WD-<hex> (crypto withdrawal, mongo _id) or CO-<hex> (PHP cashout).
const REFERENCE_PATTERN = /\b(WD|CO)-[A-Za-z0-9]+\b/i;

async function callSupport(path: string, reference: string): Promise<LookupResult> {
  const res = await fetch(`/api/v1/support/withdrawals/${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reference }),
  });
  return res.json();
}

export default function UserTools() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  // Tracks the most recently looked-up reference + what actions it
  // offers, so a follow-up like "retry it" knows what "it" refers to.
  const [activeRef, setActiveRef] = useState<{ reference: string; canRetry: boolean; canCancel: boolean } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  function addAssistantMessage(text: string) {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "assistant", text, createdAt: Date.now() },
    ]);
  }

  async function handleMessage(text: string) {
    const refMatch = text.match(REFERENCE_PATTERN);

    if (refMatch) {
      const reference = refMatch[0].toUpperCase();
      const result = await callSupport("lookup", reference);

      if (!result.success) {
        setActiveRef(null);
        addAssistantMessage(result.message || "I couldn't find that reference on your account.");
        return;
      }

      setActiveRef({
        reference,
        canRetry: !!result.canRetry,
        canCancel: !!result.canCancel,
      });

      let reply = result.summary || "Found it, but I don't have a status summary to show.";
      if (result.canRetry || result.canCancel) {
        const options = [
          result.canRetry ? "say \"retry\" to try it again" : null,
          result.canCancel ? "say \"cancel\" to close it out" : null,
        ].filter(Boolean).join(", or ");
        reply += ` You can ${options}.`;
      }
      addAssistantMessage(reply);
      return;
    }

    const lower = text.toLowerCase();
    const wantsRetry = /\bretry\b/.test(lower);
    const wantsCancel = /\bcancel\b|\bclose\b/.test(lower);

    if ((wantsRetry || wantsCancel) && activeRef) {
      if (wantsRetry && !activeRef.canRetry) {
        addAssistantMessage(`${activeRef.reference} isn't eligible for retry right now.`);
        return;
      }
      if (wantsCancel && !activeRef.canCancel) {
        addAssistantMessage(`${activeRef.reference} isn't eligible to cancel right now.`);
        return;
      }

      const result = await callSupport(wantsRetry ? "retry" : "cancel", activeRef.reference);
      addAssistantMessage(result.message || (result.success ? "Done." : "That didn't work — please try again."));
      if (result.success) setActiveRef(null);
      return;
    }

    if (wantsRetry || wantsCancel) {
      addAssistantMessage("I don't have a transaction in context yet — give me a reference number first (like WD-abc123 or CO-abc123).");
      return;
    }

    addAssistantMessage(
      "I can look up a specific transaction if you give me its reference number " +
      "(starts with WD- for crypto withdrawals, or CO- for PHP cashouts)."
    );
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", text, createdAt: Date.now() },
    ]);
    setInput("");
    setSending(true);

    try {
      await handleMessage(text);
    } catch {
      addAssistantMessage("Something went wrong reaching support. Please try again in a moment.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="user-tools">
      {open && (
        <div className="user-tools-panel" role="dialog" aria-label="User Tools">
          <div className="user-tools-header">
            <div>
              <div className="user-tools-title">User Tools</div>
              <div className="user-tools-subtitle">Get help with your account</div>
            </div>
            <button
              className="user-tools-close"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="user-tools-messages" ref={scrollRef}>
            {messages.map((m) => (
              <div key={m.id} className={`user-tools-msg user-tools-msg-${m.role}`}>
                {m.text}
              </div>
            ))}
            {sending && (
              <div className="user-tools-msg user-tools-msg-assistant user-tools-typing">
                <span></span>
                <span></span>
                <span></span>
              </div>
            )}
          </div>

          <div className="user-tools-input-row">
            <textarea
              className="user-tools-input"
              placeholder="Reference number, or 'retry' / 'cancel'…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <button
              className="user-tools-send"
              onClick={handleSend}
              disabled={!input.trim() || sending}
              aria-label="Send"
            >
              ↑
            </button>
          </div>
        </div>
      )}

      <button
        className="user-tools-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close User Tools" : "Open User Tools"}
      >
        {open ? "×" : "🛠"}
      </button>
    </div>
  );
}
