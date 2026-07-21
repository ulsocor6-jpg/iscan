import express from "express";
import crypto from "crypto";
import { parseMayaNotification } from "../parsers/mayaNotificationParser.js";
import processTransaction from "../core/processTransaction.js";
import verificationEngine from "../services/verification/VerificationEngine.js";
import phpDepositWatcher from "../services/php/PhpDepositWatcher.js";
import deduplicationService from "../services/ingestion/deduplicationService.js";
import inspectorService from "../services/inspectorService.js";
import { InspectorStage } from "../inspector/inspectorConstants.js";
import brainBus from "../brainbus/brainBus.js";
import Channels from "../brainbus/channels.js";

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
    console.warn("[Maya Webhook] Rejected — secret mismatch");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { title, text, timestamp, userId, signature, operationId } = req.body;

  if (!title && !text) {
    return res.status(400).json({ error: "Missing notification content" });
  }
  if (!userId || !timestamp || !signature) {
    console.warn("[Maya Webhook] Rejected — missing userId, timestamp, or signature");
    return res.status(401).json({ error: "Missing authentication fields" });
  }

  // ── Legacy HMAC check (ONLY for non‑operation requests) ────────
  // If operationId is provided, skip this – the watcher will verify using
  // the operation‑specific secret.
  if (!operationId) {
    const isValid = verifyAndroidSignature(userId, title, text, timestamp, signature);
    if (!isValid) {
      console.warn(`[Maya Webhook] Rejected — invalid signature for userId=${userId}`);
      return res.status(401).json({ error: "Invalid signature" });
    }
  }

  console.log(`[Maya Webhook] Received — title: "${title}" | text: "${text}"`);

  // ── Parse notification ──────────────────────────────────────────
  const transaction = parseMayaNotification({
    title: title || "",
    text: text || "",
    subText: "",
    timestamp: timestamp ? new Date(timestamp * 1000) : new Date(),
  });

  if (!transaction) {
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

  transaction.userId = userId;

  // ── Start Inspector flow ────────────────────────────────────────
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
    userId,
    operationId,
  });
  const flowId = flow.flowId;

  await inspectorService.startStage(flowId, InspectorStage.WATCHER, { title, text });
  await inspectorService.finishStage(flowId, InspectorStage.WATCHER, {
    result: { notificationReceived: true, title },
    decision: { reason: "NOTIFICATION_RECEIVED" },
  });

  await inspectorService.startStage(flowId, InspectorStage.PARSER, { title, text });
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

  // ── Dedup stage ──────────────────────────────────────────────────
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

  // ── Process using the dedicated watcher ─────────────────────────
  const watcherResult = await phpDepositWatcher.processNotification({
    source: "MAYA",
    userId,
    operationId,
    amount: transaction.amount,
    reference: transaction.referenceId || transaction.senderPhone,
    title,
    text,
    timestamp,
    signature,
    parsedTransaction: transaction,
    flowId,
    eventId,
  });

  if (!watcherResult.success) {
    // Map status to HTTP response
    if (watcherResult.status === "verification_failed") {
      return res.status(400).json({ status: "verification_failed", reason: watcherResult.message });
    }
    if (watcherResult.status === "operation_not_found" || watcherResult.status === "no_matching_operation") {
      return res.status(404).json({ status: "not_found", message: watcherResult.message });
    }
    return res.status(500).json({ status: "error", message: watcherResult.message });
  }

  console.log(`[Maya] processed ${eventId}`);
  return res.status(200).json({ status: "ok", transaction: watcherResult.transaction });
});

export default router;
