import Imap from "imap";
import { simpleParser } from "mailparser";
import processTransaction from "../../core/processTransaction.js";
import deduplicationService from "./deduplicationService.js";
import { parseMariBankEmail } from "../../parsers/maribankEmailParser.js";
import inspectorService from "../../services/inspectorService.js";
import { InspectorStage } from "../../inspector/inspectorConstants.js";

export function startMariBankListener() {
  const imap = new Imap({
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASS,
    host: "imap.gmail.com",
    port: 993,
    tls: true,
    tlsOptions: { servername: "imap.gmail.com" },
  });

  imap.once("ready", () => {
    console.log("[MariBank Listener] IMAP connected, watching inbox...");
    imap.openBox("INBOX", false, (err) => {
      if (err) { console.error("[MariBank Listener] Failed to open inbox:", err.message); return; }

      imap.on("mail", () => {
        imap.search(["UNSEEN"], async (err, results) => {
          if (err) { console.error("[MariBank Listener] Search error:", err.message); return; }
          if (!results || !results.length) return;

          const f = imap.fetch(results, { bodies: "" });
          f.on("message", (msg) => {
            msg.on("body", async (stream) => {
              let flow = null;
              try {
                const parsed = await simpleParser(stream);
                const emailText = parsed.text;

                // ── Filter: only process real MariBank transaction alerts ──
                // Skips MongoDB/Railway/marketing mail before any Inspector
                // flow is created, so the Inspector stays clean.
                const fromAddress = (parsed.from?.value?.[0]?.address || "").toLowerCase();
                if (!fromAddress.includes("alerts@maribank.com.ph")) {
                  console.log(`[MariBank Listener] Skipped — not from MariBank (from: ${fromAddress || "unknown"})`);
                  return;
                }

                // ── Parse the email first so we know the reference ID ──
                // before deciding whether to start a new flow or continue
                // one that already exists from a UI deposit request.
                const transaction = parseMariBankEmail(emailText);

                // ── Link to an existing deposit-request flow if possible ──
                let reused = false;
                if (transaction?.referenceId) {
                  const existing = await inspectorService.findRunningByReference(transaction.referenceId);
                  if (existing) {
                    flow = existing;
                    reused = true;
                  }
                }

                // ── Otherwise start a fresh flow (e.g. unsolicited transfer
                // with no matching deposit request, or parse failed) ──
                if (!flow) {
                  flow = await inspectorService.startFlow({
                    pipeline: "PHP_DEPOSIT",
                    source: "MARI_BANK",
                    transactionType: "cashin",
                    referenceId: transaction?.referenceId || null,
                    rawNotification: { subject: parsed.subject, from: parsed.from?.text, text: emailText?.slice(0, 500) },
                  });
                }
                const flowId = flow.flowId;

                // ── WATCHER stage ────────────────────────────────────
                await inspectorService.startStage(flowId, InspectorStage.WATCHER, {
                  subject: parsed.subject,
                  from: parsed.from?.text,
                });
                await inspectorService.finishStage(flowId, InspectorStage.WATCHER, {
                  result: { emailReceived: true, subject: parsed.subject, linkedToDepositRequest: reused },
                  decision: { reason: "EMAIL_RECEIVED" },
                });

                // ── PARSER stage ─────────────────────────────────────
                await inspectorService.startStage(flowId, InspectorStage.PARSER, { text: emailText?.slice(0, 300) });

                if (!transaction) {
                  await inspectorService.failStage(flowId, InspectorStage.PARSER, "Not a MariBank transaction email", {
                    decision: { reason: "IGNORED" },
                  });
                  return;
                }

                await inspectorService.finishStage(flowId, InspectorStage.PARSER, {
                  result: {
                    amount: transaction.amount,
                    senderName: transaction.senderName,
                    senderLastFour: transaction.senderLastFour,
                    recipientLastFour: transaction.recipientLastFour,
                    referenceId: transaction.referenceId,
                  },
                  decision: { reason: "PARSED_OK" },
                });

                // ── DEDUP stage ──────────────────────────────────────
                await inspectorService.startStage(flowId, "DEDUP", {});
                const eventId = deduplicationService.createHash(transaction);
                const created = await deduplicationService.createEvent("MARIBANK", eventId, transaction);

                if (!created) {
                  await inspectorService.failStage(flowId, "DEDUP", "Duplicate event", {
                    decision: { reason: "DUPLICATE" },
                  });
                  return;
                }

                const processing = await deduplicationService.startProcessing("MARIBANK", eventId);
                if (!processing) {
                  await inspectorService.failStage(flowId, "DEDUP", "Already processing", {
                    decision: { reason: "ALREADY_PROCESSING" },
                  });
                  return;
                }

                await inspectorService.finishStage(flowId, "DEDUP", {
                  result: { eventId },
                  decision: { reason: "NEW_EVENT" },
                });

                // ── processTransaction ────────────────────────────────
                try {
                  await processTransaction({ ...transaction, _flowId: flowId });
                  await deduplicationService.markProcessed("MARIBANK", eventId);
                  await inspectorService.finishFlow(flowId);
                  console.log(`[MariBank] processed ${eventId}`);
                } catch (err) {
                  await deduplicationService.markFailed("MARIBANK", eventId, err.message);
                  throw err;
                }

              } catch (procErr) {
                console.error("[MariBank Listener] Error:", procErr.message);
                if (flow) {
                  await inspectorService.failStage(flow.flowId, "PROCESS_TRANSACTION", procErr.message).catch(() => {});
                }
              }
            });
          });

          f.once("error", (err) => console.error("[MariBank Listener] Fetch error:", err.message));
        });
      });
    });
  });

  imap.once("error", (err) => console.error("[MariBank Listener] IMAP error:", err.message));
  imap.once("end", () => {
    console.warn("[MariBank Listener] Connection ended. Reconnecting in 10s...");
    setTimeout(() => startMariBankListener(), 10000);
  });

  imap.connect();
}
