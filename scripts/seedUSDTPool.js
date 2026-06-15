import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);

const col = mongoose.connection.db.collection('phpliquiditypools');

// USDT pool
const usdt = await col.findOne({ currency: 'USDT' });
if (usdt) {
  console.log('USDT pool already exists:', usdt);
} else {
  await col.insertOne({
    currency: 'USDT',
    balance: 10000,        // $10,000 USDT starting reserve
    reserved: 0,
    minThreshold: 500,     // pause if below $500 USDT
    totalSwappedIn: 0,
    totalSwappedOut: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log('✅ USDT pool seeded with $10,000 USDT');
}

// USDC pool too
const usdc = await col.findOne({ currency: 'USDC' });
if (usdc) {
  console.log('USDC pool already exists:', usdc);
} else {
  await col.insertOne({
    currency: 'USDC',
    balance: 10000,
    reserved: 0,
    minThreshold: 500,
    totalSwappedIn: 0,
    totalSwappedOut: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log('✅ USDC pool seeded with $10,000 USDC');
}

await mongoose.disconnect();
