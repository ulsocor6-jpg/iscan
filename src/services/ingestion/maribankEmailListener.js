import Imap from "imap";
import { simpleParser } from "mailparser";
import processTransaction from "../../core/processTransaction.js";
import deduplicationService from "./deduplicationService.js";
import { parseMariBankEmail } from "../../parsers/maribankEmailParser.js";

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
      if (err) {
        console.error("[MariBank Listener] Failed to open inbox:", err.message);
        return;
      }

      imap.on("mail", () => {
        const searchCriteria = ["UNSEEN"];

        imap.search(searchCriteria, (err, results) => {
          if (err) {
            console.error("[MariBank Listener] Search error:", err.message);
            return;
          }
          if (!results || !results.length) return;

          const f = imap.fetch(results, { bodies: "" });

          f.on("message", (msg) => {
            msg.on("body", async (stream) => {
              try {
                const parsed = await simpleParser(stream);
                const transaction = parseMariBankEmail(parsed.text);

                if (transaction) {

                  const eventId = deduplicationService.createHash(transaction);

                  const created = await deduplicationService.createEvent(
                    "MARIBANK",
                    eventId,
                    transaction
                  );

                  if (!created) {
                    console.log("[MariBank] Duplicate event ignored.");
                    return;
                  }

                  const processing = await deduplicationService.startProcessing(
                    "MARIBANK",
                    eventId
                  );

                  if (!processing) {
                    console.log("[MariBank] Event already processing.");
                    return;
                  }

                  try {

                    await processTransaction(transaction);

                    await deduplicationService.markProcessed(
                      "MARIBANK",
                      eventId
                    );

                    console.log(`[MariBank] processed ${eventId}`);

                  } catch (err) {

                    await deduplicationService.markFailed(
                      "MARIBANK",
                      eventId,
                      err.message
                    );

                    throw err;
                  }

                }
              } catch (procErr) {
                console.error("[MariBank Listener] Error processing email:", procErr.message);
              }
            });
          });

          f.once("error", (fetchErr) => {
            console.error("[MariBank Listener] Fetch error:", fetchErr.message);
          });
        });
      });
    });
  });

  imap.once("error", (err) => {
    console.error("[MariBank Listener] IMAP connection error:", err.message);
  });

  imap.once("end", () => {
    console.warn("[MariBank Listener] IMAP connection ended. Reconnecting in 10s...");
    setTimeout(() => startMariBankListener(), 10000);
  });

  imap.connect();
}
