import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);

const pool = await mongoose.connection.db.collection('phpliquiditypools').findOne({ currency: 'PHP' });

if (pool) {
  console.log('Pool already exists:', pool);
} else {
  await mongoose.connection.db.collection('phpliquiditypools').insertOne({
    currency: 'PHP',
    balance: 500000,
    reserved: 0,
    minThreshold: 50000,
    totalSwappedIn: 0,
    totalSwappedOut: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log('✅ PHP liquidity pool seeded with ₱500,000');
}

await mongoose.disconnect();
