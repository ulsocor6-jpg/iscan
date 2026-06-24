import { ImapFlow } from "imapflow";

const client = new ImapFlow({
  host: "imap.gmail.com",
  port: 993,
  secure: true,
  auth: {
    user: "uls.ocor.7@gmail.com",
    pass: "loyloyloyloweloweloyloyloyweloy"
  },
  logger: false
});

try {
  await client.connect();
  console.log("✅ Login successful");
  const lock = await client.getMailboxLock("INBOX");
  console.log("✅ Inbox accessible, messages:", client.mailbox.exists);
  lock.release();
  await client.logout();
} catch (err) {
  console.error("❌ Login failed:", err.message);
}
