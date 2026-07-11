import express from "express";
import { parseMayaNotification } from "../parsers/mayaNotificationParser.js";
import processTransaction from "../core/processTransaction.js";
import deduplicationService from "../services/ingestion/deduplicationService.js";

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
    // Not a deposit-related notification at all (e.g. an unrelated push
    // notification). Still record it so it's visible in the admin Logs
    // view — same as how MariBank logs non-transaction emails as FAILED —
    // but it must never enter the Flagged/DepositReview queue, since
    // there's nothing here for an admin to act on.
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

  const eventId = deduplicationService.createHash({ title, text });

    const created = await deduplicationService.createEvent(
      "MAYA",
      eventId,
      transaction
    );

    if (!created) {
      return res.status(200).json({
        status: "duplicate"
      });
    }

    const processing = await deduplicationService.startProcessing(
      "MAYA",
      eventId
    );

    if (!processing) {
      return res.status(200).json({
        status: "already_processing"
      });
    }

    try {

      await processTransaction(transaction);

      await deduplicationService.markProcessed(
        "MAYA",
        eventId
      );

      console.log(`[Maya] processed ${eventId}`);

      return res.status(200).json({
        status:"ok",
        transaction
      });

    } catch(err) {

      await deduplicationService.markFailed(
        "MAYA",
        eventId,
        err.message
      );

      // Respond with a clean error instead of rethrowing — an uncaught
      // throw here would escape as an unhandled rejection with nothing
      // above this route to catch it, risking a full process crash for
      // what should be an isolated, single-request failure.
      console.error(`[Maya] processing failed for ${eventId}:`, err.message);
      return res.status(500).json({ status: "error", error: err.message });

    }
});

export default router;
