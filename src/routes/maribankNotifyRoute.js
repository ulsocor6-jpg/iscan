import express from "express";
import { parseMariBankEmail } from "../parsers/maribankEmailParser.js";
import processTransaction from "../core/processTransaction.js";
import deduplicationService from "../services/ingestion/deduplicationService.js";
import inspectorService from "../services/inspectorService.js";
import { InspectorStage } from "../inspector/inspectorConstants.js";

const router = express.Router();
const MAYA_SECRET = process.env.MAYA_SECRET || "iscan-maya-secret-2024";

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
    },
    decision: { reason: "PARSED_OK" },
  });

  const eventId = deduplicationService.createHash({ title, text });
  const created = await deduplicationService.createEvent("MARIBANK", eventId, transaction);

  if (!created) {
    return res.status(200).json({ status: "duplicate" });
  }

  const processing = await deduplicationService.startProcessing("MARIBANK", eventId);
  if (!processing) {
    return res.status(200).json({ status: "already_processing" });
  }

  try {
    await processTransaction({ ...transaction, _flowId: flowId });
    await deduplicationService.markProcessed("MARIBANK", eventId);
    await inspectorService.finishFlow(flowId);
    console.log(`[MariBank Webhook] processed ${eventId}`);
    return res.status(200).json({ status: "ok", transaction });
  } catch (err) {
    await deduplicationService.markFailed("MARIBANK", eventId, err.message);
    throw err;
  }
});

export default router;
