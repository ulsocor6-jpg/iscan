import mongoose from 'mongoose';

const linkedWalletSchema = new mongoose.Schema({
  address:       { type: String, required: true },
  provider:      { type: String, enum: ['metamask', 'ronin', 'coinbase', 'other'], default: 'metamask' },
  chainId:       { type: String, default: '0x1' },
  network:       { type: String, default: 'Ethereum' },
  nativeToken:   { type: String, default: 'ETH' },
  nativeBalance: { type: Number, default: 0 },
  usdcBalance:   { type: Number, default: 0 },
  addedAt:       { type: Date, default: Date.now }
}, { _id: false });

const walletSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  iscanAddress: { type: String, required: true, unique: true },
  balance:      { type: Number, default: 0 },
  currency:     { type: String, default: 'PHP' },
  linkedWallets: [linkedWalletSchema],
  status:       { type: String, enum: ['active', 'suspended'], default: 'active' }
}, { timestamps: true });

export default mongoose.model('Wallet', walletSchema);
