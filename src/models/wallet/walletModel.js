import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },

  iscanAddress: {
    type: String,
    required: true,
    unique: true
  },

  linkedWallets: [
    {
      address: String,
      provider: {
        type: String,
        enum: ['metamask', 'ronin', 'other'],
        default: 'metamask'
      },
      addedAt: {
        type: Date,
        default: Date.now
      }
    }
  ],

  status: {
    type: String,
    enum: ['active', 'frozen', 'suspended'],
    default: 'active'
  }
}, {
  timestamps: true
});

export default mongoose.model('Wallet', walletSchema);
