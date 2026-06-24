import 'dotenv/config';
import mongoose from 'mongoose';
import DepositAddress from './src/models/depositAddressModel.js';

await mongoose.connect(process.env.MONGODB_URI);
const rows = await DepositAddress.find({ token: 'PHP' });
console.log(`Found ${rows.length} PHP deposit address record(s):`);
console.log(JSON.stringify(rows, null, 2));
await mongoose.disconnect();
