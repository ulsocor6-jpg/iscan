import express from "express";
import { parseMariBankEmail } from "../parsers/maribankEmailParser.js";
import processTransaction from "../core/processTransaction.js";
import deduplicationService from "../services/ingestion/deduplicationService.js";
import inspectorService from "../services/inspectorService.js";
import { InspectorStage } from "../inspector/inspectorConstants.js";

const router = express.Router();

if (!process.env.MAYA_SECRET) {
  throw new Error(
    "MAYA_SECRET is not set. Refusing to start with an insecure default — " +
    "set MAYA_SECRET in your environment (Railway variables / .env)."
  );
}
const MAYA_SECRET = process.env.MAYA_SECRET;

router.post("/notify", async (req, res) => {
  const secret = req.headers["x-maya-secret"];
  if (secret !== MAYA_SECRET) {
    if (!secret) {
      console.warn("[MariBank Webhook] Rejected — no x-maya-secret header sent");
    } else {
      console.warn("[MariBank Webhook] Rejected — secret mismatch");
    }
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { title, text, timestamp } = req.body;
  if (!title && !text) {
    return res.status(400).json({ error: "Missing notification content" });
  }

  console.log(`[MariBank Webhook] Received — title: "${title}" | text: "${text}"`);

  // Combine title + text into a single string the email parser can work with
  const combined = `${title || ""}\n${text || ""}`.trim();
  const transaction = parseMariBankEmail(combined);

  if (!transaction) {
    // FIX: this ignored-event hash still only uses {title, text} — kept as
    // is here since non-financial notifications (promos, balance pings)
    // are expected to legitimately repeat verbatim, so exact-match dedup
    // is the correct behavior for this branch specifically.
    const ignoredEventId = deduplicationService.createHash({ title, text });
    const ignoredCreated = await deduplicationService.createEvent(
      "MARIBANK",
      ignoredEventId,
      { title, text, raw: combined }
    );
    if (ignoredCreated) {
      await deduplicationService.markIgnored(
        "MARIBANK",
        ignoredEventId,
        "Not a financial transaction"
      );
    }
    return res.status(200).json({ status: "ignored", reason: "Not a financial transaction" });
  }

  // ── Link to existing deposit-request flow if referenceId matches ──
  let flow = null;
  if (transaction.referenceId) {
    flow = await inspectorService.findRunningByReference(transaction.referenceId);
  }
  if (!flow) {
    flow = await inspectorService.startFlow({
      pipeline: "PHP_DEPOSIT",
      source: "MARIBANK_ANDROID",
      transactionType: "cashin",
      referenceId: transaction.referenceId || null,
      amount: transaction.amount,
      rawNotification: { title, text },
    });
  }
  const flowId = flow.flowId;

  await inspectorService.startStage(flowId, InspectorStage.WATCHER, { title, text });
  await inspectorService.finishStage(flowId, InspectorStage.WATCHER, {
    result: { notificationReceived: true, title },
    decision: { reason: "NOTIFICATION_RECEIVED" },
  });

  await inspectorService.startStage(flowId, InspectorStage.PARSER, { combined });
  await inspectorService.finishStage(flowId, InspectorStage.PARSER, {
    result: {
      amount: transaction.amount,
      senderName: transaction.senderName,
      referenceId: transaction.referenceId,
      recipientLastFour: transaction.recipientLastFour,
    },
    decision: { reason: "PARSED_OK" },
  });

  // ── DEDUP stage ──────────────────────────────────────────────────────
  // FIX: this stage previously had zero Inspector instrumentation — a
  // duplicate (real or false-positive) caused the route to silently
  // return 200 "duplicate" with the flow left permanently stuck at
  // RUNNING and no indication anywhere of what happened or why.
  //
  // FIX: the hash previously was createHash({ title, text }) with no
  // time component. Two genuinely separate transfers with identical
  // phrasing (e.g. two ₱20 test transfers with the same notification
  // text) hash identically and collide on the eventId unique index,
  // so the second real transaction was silently dropped as a "duplicate"
  // forever. Bucketing on the transaction's actual identifying fields
  // plus a coarse time window (5 minutes) preserves real dedup — a
  // notification genuinely redelivered by Android within the window
  // still collides and is correctly dropped — while letting legitimate
  // repeat transfers with the same amount through once the window
  // passes.
  await inspectorService.startStage(flowId, "DEDUP", { transaction });

  const notificationTime = timestamp ? new Date(timestamp) : new Date();
  const timeBucket = Math.floor(notificationTime.getTime() / (5 * 60 * 1000)); // 5-min buckets
  const eventId = deduplicationService.createHash({
    amount: transaction.amount,
    referenceId: transaction.referenceId,
    recipientLastFour: transaction.recipientLastFour,
    timeBucket,
  });

  const created = await deduplicationService.createEvent("MARIBANK", eventId, transaction);

  if (!created) {
    await inspectorService.failStage(flowId, "DEDUP", "Duplicate event within time window", {
      result: { eventId, timeBucket },
      decision: { reason: "DUPLICATE" },
    });
    return res.status(200).json({ status: "duplicate" });
  }

  const processing = await deduplicationService.startProcessing("MARIBANK", eventId);
  if (!processing) {
    await inspectorService.failStage(flowId, "DEDUP", "Already processing", {
      result: { eventId },
      decision: { reason: "ALREADY_PROCESSING" },
    });
    return res.status(200).json({ status: "already_processing" });
  }

  await inspectorService.finishStage(flowId, "DEDUP", {
    result: { eventId },
    decision: { reason: "NEW_EVENT" },
  });

  try {
    await processTransaction({ ...transaction, _flowId: flowId });
    await deduplicationService.markProcessed("MARIBANK", eventId);
    await inspectorService.finishFlow(flowId);
    console.log(`[MariBank Webhook] processed ${eventId}`);
    return res.status(200).json({ status: "ok", transaction });
  } catch (err) {
    await deduplicationService.markFailed("MARIBANK", eventId, err.message);
    await inspectorService.failStage(flowId, "PROCESS_TRANSACTION", err.message).catch(() => {});

    // Respond with a clean error instead of rethrowing — an uncaught
    // throw here would escape as an unhandled rejection with nothing
    // above this route to catch it, risking a full process crash for
    // what should be an isolated, single-request failure.
    console.error(`[MariBank Webhook] processing failed for ${eventId}:`, err.message);
    return res.status(500).json({ status: "error", error: err.message });
  }
});

export default router;
