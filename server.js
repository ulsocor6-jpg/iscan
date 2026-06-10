import { webcrypto } from 'crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

import connectDB from './config/db.js';

import authRoutes from './src/routes/authRoutes.js';
import walletRoutes from './src/routes/walletRoutes.js';
import bankRoutes from './src/routes/bankRoutes.js';
import kycRoutes from './src/routes/kycRoutes.js';
import paymentRoutes from './src/routes/paymentRoutes.js';
import remittanceRoutes from './src/routes/remittanceRoutes.js';
import transferRoutes from './src/routes/transferRoutes.js';
import ledgerRoutes from './src/routes/ledgerRoutes.js';
import beneficiaryRoutes from './src/routes/beneficiaryRoutes.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/wallet', walletRoutes);
app.use('/api/v1/bank', bankRoutes);
app.use('/api/v1/kyc', kycRoutes);
app.use('/api/v1/payment', paymentRoutes);
app.use('/api/v1/remittance', remittanceRoutes);
app.use('/api/v1/transfer', transferRoutes);
app.use('/api/v1/ledger', ledgerRoutes);
app.use('/api/v1/beneficiary', beneficiaryRoutes);

// Page routes
app.get('/',                (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/login',           (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/register',        (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));
app.get('/dashboard',       (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/reset-password',  (req, res) => res.sendFile(path.join(__dirname, 'public', 'reset-password.html')));

const PORT = process.env.PORT || 3000;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`ISCAN running successfully on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to database:', err);
  });
