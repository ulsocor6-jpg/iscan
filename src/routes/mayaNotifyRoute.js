import express from "express";
import { parseMayaNotification } from "../parsers/mayaNotificationParser.js";
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
      console.warn("[Maya Webhook] Rejected — no x-maya-secret header sent");
    } else {
      console.warn("[Maya Webhook] Rejected — secret mismatch");
    }
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { title, text, timestamp } = req.body;
  if (!title && !text) {
    return res.status(400).json({ error: "Missing notification content" });
  }

  console.log(`[Maya Webhook] Received — title: "${title}" | text: "${text}"`);

  const transaction = parseMayaNotification({
    title: title || "",
    text: text || "",
    subText: "",
    timestamp: timestamp ? new Date(timestamp) : new Date(),
  });

  if (!transaction) {
    // Not a deposit-related notification at all — same as MariBank's
    // non-financial branch. No Inspector flow: there's nothing here for
    // an admin to act on, and the WATCHER/PARSER stages exist to trace
    // real deposit attempts, not every push notification Maya sends.
    const ignoredEventId = deduplicationService.createHash({ title, text });
    const ignoredCreated = await deduplicationService.createEvent(
      "MAYA",
      ignoredEventId,
      { title, text, raw: `${title || ""} ${text || ""}`.trim() }
    );
    if (ignoredCreated) {
      await deduplicationService.markIgnored(
        "MAYA",
        ignoredEventId,
        "Not a financial transaction"
      );
    }
    return res.status(200).json({ status: "ignored", reason: "Not a financial transaction" });
  }

  // ── Create the Inspector flow now that we know this is a real deposit ──
  const flow = await inspectorService.startFlow({
    pipeline: "PHP_DEPOSIT",
    source: "MAYA",
    transactionType: "cashin",
    amount: transaction.amount,
    sender: transaction.senderPhone || transaction.senderName || null,
    senderPhone: transaction.senderPhone || null,
    senderLastFour: transaction.senderLastFour || null,
    rawNotification: { title, text },
    parsedNotification: transaction,
  });
  const flowId = flow.flowId;

  await inspectorService.startStage(flowId, InspectorStage.WATCHER, { title, text });
  await inspectorService.finishStage(flowId, InspectorStage.WATCHER, {
    result: { notificationReceived: true, title },
    decision: { reason: "NOTIFICATION_RECEIVED" },
  });

  await inspectorService.startStage(flowId, InspectorStage.PARSER, {
    title, text,
  });
  await inspectorService.finishStage(flowId, InspectorStage.PARSER, {
    result: {
      amount: transaction.amount,
      senderPhone: transaction.senderPhone,
      senderName: transaction.senderName,
      senderLastFour: transaction.senderLastFour,
      type: transaction.type,
    },
    decision: { reason: "PARSED_OK" },
  });

  // ── DEDUP stage ──────────────────────────────────────────────────────
  // Note: this still hashes on {title, text} only, same as before this
  // patch — unlike MariBank's dedup it has no time-bucket component, so
  // it carries the same "two identical-text transfers collide" risk that
  // MariBank's dedup had before that was fixed. Left as-is here since the
  // ask was Inspector visibility, not a dedup-key change — flag separately
  // if you want that ported over too.
  await inspectorService.startStage(flowId, "DEDUP", { transaction });

  const eventId = deduplicationService.createHash({ title, text });

  const created = await deduplicationService.createEvent("MAYA", eventId, transaction);

  if (!created) {
    await inspectorService.failStage(flowId, "DEDUP", "Duplicate event", {
      result: { eventId },
      decision: { reason: "DUPLICATE" },
    });
    return res.status(200).json({ status: "duplicate" });
  }

  const processing = await deduplicationService.startProcessing("MAYA", eventId);
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

    await deduplicationService.markProcessed("MAYA", eventId);
    await inspectorService.finishFlow(flowId);

    console.log(`[Maya] processed ${eventId}`);

    return res.status(200).json({
      status: "ok",
      transaction,
    });

  } catch (err) {

    await deduplicationService.markFailed("MAYA", eventId, err.message);
    await inspectorService.failStage(flowId, "PROCESS_TRANSACTION", err.message).catch(() => {});

    // Respond with a clean error instead of rethrowing — an uncaught
    // throw here would escape as an unhandled rejection with nothing
    // above this route to catch it, risking a full process crash for
    // what should be an isolated, single-request failure.
    console.error(`[Maya] processing failed for ${eventId}:`, err.message);
    return res.status(500).json({ status: "error", error: err.message });

  }
});

export default router;
