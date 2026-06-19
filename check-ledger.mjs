import 'dotenv/config';
import mongoose from 'mongoose';
import Ledger from './src/models/ledgerModel.js';

await mongoose.connect(process.env.MONGODB_URI);

const rows = await Ledger.find({})
  .sort({ createdAt: -1 })
  .limit(50);

console.log(JSON.stringify(rows, null, 2));

await mongoose.disconnect();
