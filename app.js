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
import { apiNotFoundHandler, globalErrorHandler } from "./middleware/apiErrorHandlers.js";
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

// ── BrainBus: system-wide message bus ───────────────────────────────────
import { wireBrainBus } from "./src/brainbus/subscribers.js";
wireBrainBus();

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
import sessionDebugRoutes from "./src/auth/routes/sessionDebugRoutes.js";
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
import adminTreasuryRoutes from "./src/routes/adminTreasuryRoutes.js";
import maribankNotifyRoute from "./src/routes/maribankNotifyRoute.js";
import adminReconciliationRoutes from "./src/routes/adminReconciliationRoutes.js";

import inspectorRoutes from "./src/routes/admin/inspectorRoutes.js";
import operatorRoutes from "./src/routes/operator/operatorRoutes.js";
import intelligenceRoutes from "./src/routes/intelligence/intelligenceRoutes.js";
import activityRoutes from "./src/routes/activityRoutes.js";
import missionControlRoutes from "./src/routes/missionControlRoutes.js";
import clientHealthRoutes from "./src/intelligence/clientHealth/clientHealthRoutes.js";
import nodeRoutes from "./src/intelligence/nodeRegistry/nodeRoutes.js";
import architectureRoutes from "./src/routes/architectureRoutes.js";
import operatorActionsRoute from "./src/routes/operator/operatorActionsRoute.js";
import supportRoutes from "./src/routes/supportRoutes.js";
import userToolsRoutes from "./src/routes/userToolsRoutes.js";
import treasuryIntegrityRoutes from "./src/routes/treasuryIntegrityRoutes.js";
import verificationRoutes from "./src/routes/verificationRoutes.js";
import historyRoute from "./src/routes/historyRoute.js";
import debugRoute from "./debugRoute.js";
import { requireAuth, requireAdmin } from "./src/auth/middleware/authMiddleware.js";

/* ===========================
   Health
=========================== */

app.get("/__health", (req, res) => {
    res.json({ ok: true });
});

app.get("/api/debug/brainbus-dump", requireAuth, requireAdmin, debugRoute);

/* ===========================
   API
=========================== */

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/auth/debug", sessionDebugRoutes);

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

app.use("/api/v1/operator/actions", operatorActionsRoute);

app.use(
 "/api/v1/support",
 supportRoutes
);

app.use("/api/v1/verification", verificationRoutes);
app.use("/api/v1/user/tools", userToolsRoutes);
app.use("/api/v1/treasury-integrity", treasuryIntegrityRoutes);

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


app.use("/api/v1/maya", mayaNotifyRoute);

app.use("/api/v1/payment", paymentRoutes);
app.use("/api/v1/payout", payoutRoutes);
app.use("/api/v1/user/background", backgroundRoutes);

app.use("/api/v1/deposit", directDepositRoutes);

app.use("/api/v1/admin/withdrawals", adminWithdrawalRoutes);
app.use("/api/v1/admin/treasury", adminTreasuryRoutes);

app.use("/api/v1/admin/deposits", adminDepositRoutes);
app.use("/api/v1/admin/users", adminUserRoutes);
app.use("/api/v1/admin/events", adminEventRoutes);
app.use("/api/v1/admin/reconciliation", reconciliationRoutes);
app.use("/api/v1/reconciliation", selfReconciliationRoutes);
app.use("/api/v1/admin/blockchain", adminBlockchainPollingRoutes);
app.use("/api/v1/admin/reconciliation", adminReconciliationRoutes);

app.use("/api/v1/crypto-withdrawals", cryptoWithdrawalRoutes);
// withdrawalRoutes.js is intentionally NOT mounted. It self-completes
// PHP withdrawals without any human disbursement step, which does not
// match how this system actually operates (operator must manually
// disburse and confirm via the Cashouts dashboard). The real PHP
// withdrawal flow is paymentRoutes.js's /cashout (mounted below at
// /api/v1/payment), which creates a pending_review WithdrawalRequest
// and alerts the operator via Telegram. Re-mount withdrawalRoutes.js
// only once a real, confirmed disbursement API exists and this
// project deliberately moves to automated sends.

/* ===========================
   NEW INTERNAL INSPECTOR
=========================== */

app.use("/api/admin/inspector", inspectorRoutes);
app.use("/api/v1/intelligence", intelligenceRoutes);
app.use("/api/v1/mission-control", missionControlRoutes);
app.use("/api/v1/client", clientHealthRoutes);
app.use("/api/v1/node", nodeRoutes);
app.use("/api/v1/admin/architecture", requireAuth, requireAdmin, architectureRoutes);

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

app.use("/api/history", historyRoute);

// Hashed build assets (JS/CSS chunks) must 404 as real 404s, never fall
// through to the SPA shell. Without this, a stale index.html referencing
// an asset hash that no longer exists in dist/assets/ gets "fixed" by
// silently serving index.html with a JS/CSS content-type mismatch —
// which is exactly the "Expected a JavaScript module but server
// responded with text/html" MIME error. Failing loud here turns that
// into a visible 404 instead of a blank white page.
app.use(apiNotFoundHandler);

app.get(/^\/assets\/.*/, (req, res) => {
    res.status(404).end();
});

app.get("/{*path}", (req, res) => {
    if (existsSync(distIndex)) {
        return res.sendFile(distIndex);
    }

    return res.status(404).send("Frontend not built. Run npm run build");
});

app.use(globalErrorHandler);

export default app;
