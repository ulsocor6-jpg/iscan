import { useState, useRef, useEffect } from "react";
import "./UserTools.css";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
};

const WELCOME: Message = {
  id: "welcome",
  role: "assistant",
  text: "Hi — I'm here to help with your deposits, withdrawals, and swaps. Ask me about a specific transaction, or describe what's going on.",
  createdAt: Date.now(),
};

// TODO(wiring): replace this with a real call to a new, ownership-scoped
// endpoint — e.g. POST /api/v1/support/operator-chat — once that exists.
// It must resolve userId from the auth cookie server-side (never trust a
// client-supplied userId) and only ever return incidents/orders that
// belong to req.user.id. Until that endpoint exists, this always returns
// a placeholder so the widget is testable end-to-end in the UI now.
async function sendToOperator(message: string): Promise<string> {
  await new Promise((r) => setTimeout(r, 500));
  return (
    "This is a placeholder response — the real connection to your account " +
    "activity isn't wired up yet. Once it is, I'll be able to look up your " +
    `actual transactions and tell you what's happening. You said: "${message}"`
  );
}

export default function UserTools() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const reply = await sendToOperator(text);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: reply, createdAt: Date.now() },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "Something went wrong reaching support. Please try again in a moment.",
          createdAt: Date.now(),
        },
      ]);
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
              placeholder="Describe the issue or ask about a transaction…"
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
