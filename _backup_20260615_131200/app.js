import { webcrypto } from 'crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── Routes ────────────────────────────────────────────────────────────────
import authRoutes from './src/routes/authRoutes.js';
import walletRoutes from './src/routes/walletRoutes.js';
import dashboardRoutes from './src/routes/dashboardRoutes.js';
import ledgerRoutes from './src/routes/ledgerRoutes.js';
import transactionRoutes from './src/routes/transactionRoutes.js';
import transferRoutes from './src/routes/transferRoutes.js';
import bankRoutes from './src/routes/bankRoutes.js';
import beneficiaryRoutes from './src/routes/beneficiaryRoutes.js';
import kycRoutes from './src/routes/kycRoutes.js';
import swapRoutes from './src/routes/swapRoutes.js';
import onrampRoutes from './src/routes/CryptoOnramproutes.js';
import remittanceRoutes from './src/routes/remittanceRoutes.js';
import p2pRoutes from './src/routes/p2pRoutes.js';
import userRoutes from './src/routes/userRoutes.js';
import internalWalletRoutes from './src/routes/internalWalletRoutes.js';
import webhookRoutes from './src/routes/webhookRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ─── API routes ───────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/wallet', walletRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/ledger', ledgerRoutes);
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/transfer', transferRoutes);
app.use('/api/v1/bank', bankRoutes);
app.use('/api/v1/beneficiaries', beneficiaryRoutes);
app.use('/api/v1/kyc', kycRoutes);
app.use('/api/v1/swap', swapRoutes);
app.use('/api/v1/onramp', onrampRoutes);
app.use('/api/v1/remittance', remittanceRoutes);
app.use('/api/v1/p2p', p2pRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/internal-wallets', internalWalletRoutes);
app.use('/api/v1/webhooks', webhookRoutes);

export default app;
