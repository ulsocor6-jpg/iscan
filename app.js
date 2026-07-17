import { webcrypto } from "crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;

import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import helmet from "helmet";
import { generalApiLimiter } from "./middleware/rateLimiters.js";
import reconciliationRoutes from './src/routes/reconciliation/reconciliationRoutes.js';
import selfReconciliationRoutes from './src/routes/reconciliation/selfReconciliationRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use((req, res, next) => { console.log(`[REQ] ${req.method} ${req.originalUrl}`); next(); });

/* ===========================
   Middleware
=========================== */

app.use(helmet());
app.use("/api", generalApiLimiter);

app.use("/api/v1/didit/webhook", express.raw({ type: "application/json" }));

app.use(express.json());
app.use(cookieParser());

import eventStreamService from "./src/services/eventStreamService.js";

/**
 * System-wide request logger ("CCTV camera" for the codebase).
 * Persists every state-changing API call (POST/PUT/PATCH/DELETE) and every
 * admin GET (viewing sensitive data) to the same Event log the deposit
 * pipeline already uses, and broadcasts it live to any connected admin
 * dashboard via SSE. Plain GETs outside /admin are skipped to avoid
 * flooding the log with routine dashboard polling.
 */
function shouldLogRequest(req) {
  if (!req.originalUrl.startsWith("/api")) return false;
  if (req.method !== "GET") return true;
  return req.originalUrl.startsWith("/api/v1/admin");
}

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (!shouldLogRequest(req)) return;
    eventStreamService
      .emit("http_request", {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - start,
        userId: req.user?.id || null,
        userEmail: req.user?.email || null,
      })
      .catch(() => {});
  });
  next();
});

app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "dist")));

/* ===========================
   Routes
=========================== */

import authRoutes from "./src/routes/authRoutes.js";
import walletRoutes from "./src/routes/walletRoutes.js";
import treasuryRoutes from "./src/routes/treasuryRoutes.js";
import feeRoutes from "./src/routes/feeRoutes.js";
import flowerRoutes from "./src/routes/flower/flowerRoutes.js";
import swapInspectorRoutes from "./src/routes/admin/swapInspector.js";
import dashboardRoutes from "./src/routes/dashboardRoutes.js";
import mayaNotifyRoute from "./src/routes/mayaNotifyRoute.js";
import ledgerRoutes from "./src/routes/ledgerRoutes.js";
import transactionRoutes from "./src/routes/transactionRoutes.js";
import transferRoutes from "./src/routes/transferRoutes.js";
import bankRoutes from "./src/routes/bankRoutes.js";
import beneficiaryRoutes from "./src/routes/beneficiaryRoutes.js";
import kycRoutes from "./src/routes/kycRoutes.js";
import diditRoutes from "./src/routes/diditRoutes.js";
import phpSwapRoutes from "./src/routes/phpSwapRoutes.js";
import onrampRoutes from "./src/routes/CryptoOnramproutes.js";
import remittanceRoutes from "./src/routes/remittanceRoutes.js";
import p2pRoutes from "./src/routes/p2pRoutes.js";
import userRoutes from "./src/routes/userRoutes.js";
import internalWalletRoutes from "./src/routes/internalWalletRoutes.js";
import webhookRoutes from "./src/routes/webhookRoutes.js";
import paymentRoutes from "./src/routes/paymentRoutes.js";
import payoutRoutes from "./src/routes/payoutRoutes.js";
import backgroundRoutes from "./src/routes/backgroundRoutes.js";
import directDepositRoutes from "./src/routes/directDepositRoutes.js";
import adminDepositRoutes from "./src/routes/adminDepositRoutes.js";
import adminUserRoutes from "./src/routes/adminUserRoutes.js";
import adminEventRoutes from "./src/routes/adminEventRoutes.js";
import adminBlockchainPollingRoutes from "./src/routes/adminBlockchainPollingRoutes.js";
import cryptoWithdrawalRoutes from "./src/routes/cryptoWithdrawalRoutes.js";
import adminWithdrawalRoutes from "./src/routes/adminWithdrawalRoutes.js";
import maribankNotifyRoute from "./src/routes/maribankNotifyRoute.js";
import adminReconciliationRoutes from "./src/routes/adminReconciliationRoutes.js";

import inspectorRoutes from "./src/routes/admin/inspectorRoutes.js";
import operatorRoutes from "./src/routes/operator/operatorRoutes.js";
import intelligenceRoutes from "./src/routes/intelligence/intelligenceRoutes.js";

/* ===========================
   Health
=========================== */

app.get("/__health", (req, res) => {
    res.json({ ok: true });
});

/* ===========================
   API
=========================== */

app.use("/api/v1/auth", authRoutes);

app.use("/api/v1/wallet", walletRoutes);
app.use("/api/v1/treasury", treasuryRoutes);
app.use("/api/v1/fees", feeRoutes);

app.use("/api/v1/dashboard", dashboardRoutes);

app.use(
    "/api/v1/intelligence",
    intelligenceRoutes
);

app.use(
 "/api/v1/operator",
 operatorRoutes
);

app.use("/api/v1/ledger", ledgerRoutes);
app.use("/api/v1/transactions", transactionRoutes);
app.use("/api/v1/transfer", transferRoutes);

app.use("/api/v1/bank", bankRoutes);
app.use("/api/v1/beneficiaries", beneficiaryRoutes);

app.use("/api/v1/flower", flowerRoutes);
app.use("/api/v1/admin", swapInspectorRoutes);

app.use("/api/v1/kyc", kycRoutes);
app.use("/api/v1/didit", diditRoutes);

app.use("/api/v1/php-swap", phpSwapRoutes);

app.use("/api/v1/onramp", onrampRoutes);
app.use("/api/v1/remittance", remittanceRoutes);

app.use("/api/v1/p2p", p2pRoutes);
app.use("/api/v1/users", userRoutes);

app.use("/api/v1/maribank", maribankNotifyRoute);

app.use("/api/v1/internal-wallets", internalWalletRoutes);

app.use("/api/v1/webhooks", webhookRoutes);

app.use("/api/v1/maya", mayaNotifyRoute);

app.use("/api/v1/payment", paymentRoutes);
app.use("/api/v1/payout", payoutRoutes);
app.use("/api/v1/user/background", backgroundRoutes);

app.use("/api/v1/deposit", directDepositRoutes);

app.use("/api/v1/admin/withdrawals", adminWithdrawalRoutes);

app.use("/api/v1/admin/deposits", adminDepositRoutes);
app.use("/api/v1/admin/users", adminUserRoutes);
app.use("/api/v1/admin/events", adminEventRoutes);
app.use("/api/v1/admin/reconciliation", reconciliationRoutes);
app.use("/api/v1/reconciliation", selfReconciliationRoutes);
app.use("/api/v1/admin/blockchain", adminBlockchainPollingRoutes);
app.use("/api/v1/admin/reconciliation", adminReconciliationRoutes);

app.use("/api/v1/crypto-withdrawals", cryptoWithdrawalRoutes);

/* ===========================
   NEW INTERNAL INSPECTOR
=========================== */

app.use("/api/admin/inspector", inspectorRoutes);
app.use("/api/v1/intelligence", intelligenceRoutes);

/* ===========================
   React Frontend
=========================== */


app.get("/reset-password", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "reset-password.html"));
});

app.get("/forgot-password", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "forgot-password.html"));
});

app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

const distIndex = path.join(__dirname, "dist", "index.html");

app.get("/{*path}", (req, res) => {
    if (existsSync(distIndex)) {
        return res.sendFile(distIndex);
    }

    return res.status(404).send("Frontend not built. Run npm run build");
});

export default app;
