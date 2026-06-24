import express from "express";
import { parseMayaNotification } from "../parsers/mayaNotificationParser.js";
import processTransaction from "../core/processTransaction.js";

const router = express.Router();
const MAYA_SECRET = process.env.MAYA_SECRET || "iscan-maya-secret-2024";

router.post("/notify", async (req, res) => {
  const secret = req.headers["x-maya-secret"];
  if (secret !== MAYA_SECRET) {
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
    return res.status(200).json({ status: "ignored", reason: "Not a financial transaction" });
  }

  try {
    await processTransaction(transaction);
    console.log(`[Maya Webhook] ✅ ref: ${transaction.referenceId} | PHP ${transaction.amount} | ${transaction.direction}`);
    return res.status(200).json({ status: "ok", transaction });
  } catch (err) {
    console.error("[Maya Webhook] Error:", err.message);
    return res.status(500).json({ error: "Processing failed" });
  }
});

export default router;
