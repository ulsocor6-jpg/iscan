import { webcrypto } from 'crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

import connectDB from './config/db.js';

// ================================
// Process Diagnostics
// ================================

process.on('uncaughtException', (err) => {
  console.error('================================');
  console.error('UNCAUGHT EXCEPTION');
  console.error(err);
  console.error('================================');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('================================');
  console.error('UNHANDLED REJECTION');
  console.error(reason);
  console.error('================================');
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Container is shutting down...');
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Process interrupted...');
});

// ================================
// Routes
// ================================

import authRoutes from './src/routes/authRoutes.js';
import p2pRoutes from './src/routes/p2pRoutes.js';
import internalWalletRoutes from './src/routes/internalWalletRoutes.js';
import walletRoutes from './src/routes/walletRoutes.js';
import transactionRoutes from './src/routes/transactionRoutes.js';
import bankRoutes from './src/routes/bankRoutes.js';
import kycRoutes from './src/routes/kycRoutes.js';
import paymentRoutes from './src/routes/paymentRoutes.js';
import remittanceRoutes from './src/routes/remittanceRoutes.js';
import transferRoutes from './src/routes/transferRoutes.js';
import ledgerRoutes from './src/routes/ledgerRoutes.js';
import beneficiaryRoutes from './src/routes/beneficiaryRoutes.js';
import onrampRoutes from './src/routes/onrampRoutes.js';
import dashboardRoutes from './src/routes/dashboardRoutes.js';
import userRoutes from './src/routes/userRoutes.js';
import { startSettlementWorker } from './src/services/settlement/settlementWorker.js';
import { startDepositMonitor } from './src/services/depositMonitor.js';

// ================================
// Express Setup
// ================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust Railway / proxy
app.set('trust proxy', 1);

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());


// Static files
app.use(express.static(path.join(__dirname, 'public')));

// ================================
// Health Checks
// ================================

app.get('/', (req, res) => {
  res.status(200).send('ISCAN API ONLINE');
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ================================
// API Routes
// ================================

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/internal', internalWalletRoutes);
app.use('/api/v1/p2p', p2pRoutes);
app.use('/api/v1/onramp', onrampRoutes);
app.use('/api/v1/wallet', walletRoutes);
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/bank', bankRoutes);
app.use('/api/v1/kyc', kycRoutes);
app.use('/api/v1/payment', paymentRoutes);
app.use('/api/v1/remittance', remittanceRoutes);
app.use('/api/v1/transfer', transferRoutes);
app.use('/api/v1/ledger', ledgerRoutes);
app.use('/api/v1/beneficiary', beneficiaryRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/users', userRoutes);

// ================================
// Frontend Pages
// ================================

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'files', 'dashboard_v3.html'));
});

app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

// ================================
// 404 Handler
// ================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// ================================
// Error Handler
// ================================

app.use((err, req, res, next) => {
  console.error('EXPRESS ERROR:', err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// ================================
// Start Server
// ================================

const PORT = Number(process.env.PORT) || 8080;

async function startServer() {
  try {
    console.log('Connecting to MongoDB...');

    await connectDB();


    console.log('MongoDB connected.');

startSettlementWorker();

startDepositMonitor();

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`ISCAN running on port ${PORT}`);
      console.log(`Health Check: /health`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`PID: ${process.pid}`);
    });

    server.on('error', (err) => {
      console.error('SERVER ERROR:', err);
    });

  } catch (err) {
    console.error('DB connection failed:', err);
    process.exit(1);
  }
}

startServer();
