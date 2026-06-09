import mongoose from 'mongoose';

const identityProfileSchema = new mongoose.Schema({

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  firstName: String,
  middleName: String,
  lastName: String,

  birthDate: Date,

  nationality: String,

  idType: String,

  idNumber: String,

  idImageUrl: String,

  selfieImageUrl: String,

  faceVerified: {
    type: Boolean,
    default: false
  },

  kycStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  }

}, {
  timestamps: true
});

export default mongoose.model(
  'IdentityProfile',
  identityProfileSchema
);
