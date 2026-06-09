import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  // We keep an internal iSCAN address for app-to-app transfers
  iscanAddress: { 
    type: String, 
    required: true, 
    unique: true 
  },
  balance: { 
    type: Number, 
    default: 0.0000 
  },
  currency: { 
    type: String, 
    default: 'ETH' 
  },
  // Array to store external Web3 wallets (Max 3)
  linkedWallets: [{
    address: { type: String, required: true },
    provider: { type: String, enum: ['metamask', 'ronin', 'other'], default: 'metamask' },
ethBalance: { type: Number, default: null },
addedAt: { type: Date, default: Date.now }
  }],
  status: { 
    type: String, 
    enum: ['active', 'suspended'],
    default: 'active' 
  }
}, { timestamps: true });

export default mongoose.model('Wallet', walletSchema);
