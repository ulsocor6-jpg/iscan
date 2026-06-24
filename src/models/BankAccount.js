import mongoose from 'mongoose';
const bankAccountSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  provider: {
    type: String,
    enum: ['bank', 'gcash', 'maya'],
    default: 'bank'
  },
  bankName: {
    type: String,
    required: function () { return this.provider === 'bank'; }
  },
  accountName: {
    type: String,
    required: true
  },
  accountNumber: {
    type: String,
    required: true
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  verified: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'rejected'],
    default: 'pending'
  }
}, {
  timestamps: true
});
export default mongoose.model('BankAccount', bankAccountSchema);
