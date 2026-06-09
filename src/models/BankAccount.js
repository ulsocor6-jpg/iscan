import mongoose from 'mongoose';

const bankAccountSchema = new mongoose.Schema({

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  bankName: {
    type: String,
    required: true
  },

  accountName: {
    type: String,
    required: true
  },

  accountNumber: {
    type: String,
    required: true
  },

  accountType: {
    type: String,
    enum: ['checking', 'savings'],
    default: 'checking'
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

export default mongoose.model(
  'BankAccount',
  bankAccountSchema
);
