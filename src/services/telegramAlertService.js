// src/services/telegramAlertService.js
// Sends alerts to a Telegram chat via the Bot API. Currently used for
// PHP cashout requests awaiting admin release — crypto withdrawals are
// automated and don't need this (see WithdrawalRequest / withdrawalProcessor.js).

import axios from "axios";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

export async function sendTelegramAlert(text) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.warn("[TelegramAlert] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — alert skipped");
    return { success: false, reason: "NOT_CONFIGURED" };
  }

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    await axios.post(url, {
      chat_id: CHAT_ID,
      text,
      parse_mode: "HTML",
    }, { timeout: 5000 });

    return { success: true };
  } catch (err) {
    console.error("[TelegramAlert] Failed to send:", err.response?.data?.description || err.message);
    return { success: false, reason: err.message };
  }
}

export async function alertCashoutAwaitingRelease(cashout) {
  const amount = (cashout.netAmount ?? cashout.amount ?? 0).toFixed(2);
  const text =
    `🔔 <b>Cashout awaiting release</b>\n` +
    `Amount: ₱${amount}\n` +
    `Channel: ${cashout.destinationType || cashout.type || "—"}\n` +
    `Name: ${cashout.accountName || "—"}\n` +
    `Account: ${cashout.destinationAccount || "—"}\n` +
    `Ref: <code>${cashout.referenceId || cashout._id}</code>\n` +
    `Requested: ${new Date(cashout.createdAt || Date.now()).toLocaleString("en-PH")}`;

  return sendTelegramAlert(text);
}

export default { sendTelegramAlert, alertCashoutAwaitingRelease };
