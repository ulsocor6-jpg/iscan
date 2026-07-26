import express from "express";
import crypto from "crypto";
import { parseMariBankEmail } from "../parsers/maribankEmailParser.js";
import processTransaction from "../core/processTransaction.js";
import phpDepositWatcher from "../services/php/PhpDepositWatcher.js";
import deduplicationService from "../services/ingestion/deduplicationService.js";
import inspectorService from "../services/inspectorService.js";
import { InspectorStage } from "../inspector/inspectorConstants.js";

const router = express.Router();

// ── Static header secret ─────────────────────────────────────────
if (!process.env.MAYA_SECRET) {
  throw new Error("MAYA_SECRET is not set.");
}
const MAYA_SECRET = process.env.MAYA_SECRET;

// ── HMAC secret (fallback for non‑operation mode) ────────────────
if (!process.env.ANDROID_PHP_SECRET) {
  throw new Error("ANDROID_PHP_SECRET is not set.");
}
const ANDROID_PHP_SECRET = process.env.ANDROID_PHP_SECRET;

function verifyAndroidSignature(userId, title, text, timestamp, receivedSignature) {
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) return false;
  const dataString = `${userId}|${title}|${text}|${timestamp}`;
  const expected = crypto
    .createHmac('sha256', ANDROID_PHP_SECRET)
    .update(dataString)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(receivedSignature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

router.post("/notify", async (req, res) => {
  // ── Header check ────────────────────────────────────────────────
  const secret = req.headers["x-maya-secret"];
  if (secret !== MAYA_SECRET) {
    console.warn("[MariBank Webhook] Rejected — secret mismatch");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { title, text, timestamp, userId, signature, operationId } = req.body;

  if (!title && !text) {
    return res.status(400).json({ error: "Missing notification content" });
  }
  if (!userId || !timestamp || !signature) {
    console.warn("[MariBank Webhook] Rejected — missing userId, timestamp, or signature");
    return res.status(401).json({ error: "Missing authentication fields" });
  }

  // ── Legacy HMAC check (ONLY for non‑operation requests) ────────
  if (!operationId) {
    const isValid = verifyAndroidSignature(userId, title, text, timestamp, signature);
    if (!isValid) {
      console.warn(`[MariBank Webhook] Rejected — invalid signature for userId=${userId}`);
      return res.status(401).json({ error: "Invalid signature" });
    }
  }

  console.log(`[MariBank Webhook] Received — title: "${title}" | text: "${text}"`);

  // ── Parse notification ──────────────────────────────────────────
  const combined = `${title || ""}\n${text || ""}`.trim();
  const transaction = parseMariBankEmail(combined);

  if (!transaction) {
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

  transaction.userId = userId;

  // ── Start Inspector flow ────────────────────────────────────────
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
      userId,
      operationId,
    });
  }
  const flowId = flow.flowId;
  brainBus.emit("deposit.created", { flowId, userId, source: "MARIBANK_ANDROID" });

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

  // ── Dedup stage ──────────────────────────────────────────────────
  await inspectorService.startStage(flowId, "DEDUP", { transaction });

  const notificationTime = timestamp ? new Date(timestamp * 1000) : new Date();
  const timeBucket = Math.floor(notificationTime.getTime() / (5 * 60 * 1000));
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

  // ── Process using the dedicated watcher ─────────────────────────
  const watcherResult = await phpDepositWatcher.processNotification({
    source: "MARIBANK",
    userId,
    operationId,
    amount: transaction.amount,
    reference: transaction.referenceId || transaction.senderName,
    title,
    text,
    timestamp,
    signature,
    parsedTransaction: transaction,
    flowId,
    eventId,
  });

  if (!watcherResult.success) {
    if (watcherResult.status === "verification_failed") {
      return res.status(400).json({ status: "verification_failed", reason: watcherResult.message });
    }
    if (watcherResult.status === "operation_not_found" || watcherResult.status === "no_matching_operation") {
      return res.status(404).json({ status: "not_found", message: watcherResult.message });
    }
    return res.status(500).json({ status: "error", message: watcherResult.message });
  }

  console.log(`[MariBank Webhook] processed ${eventId}`);
  return res.status(200).json({ status: "ok", transaction: watcherResult.transaction });
});

export default router;
