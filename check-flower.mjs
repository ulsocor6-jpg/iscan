import 'dotenv/config';
import mongoose from 'mongoose';
import DepositAddress from './src/models/depositAddressModel.js';

await mongoose.connect(process.env.MONGODB_URI);

const rows = await DepositAddress.find({ token: 'FLOWER' });

console.log(JSON.stringify(rows, null, 2));

await mongoose.disconnect();
