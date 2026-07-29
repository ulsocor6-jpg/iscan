import 'dotenv/config';
import mongoose from 'mongoose';
import User from './src/models/userModel.js';

await mongoose.connect(process.env.MONGODB_URI);
const user = await User.findById('6a56f430ac59df84da9f7073');
console.log('User found:', user ? user.email : '❌ NOT FOUND');
await mongoose.disconnect();
