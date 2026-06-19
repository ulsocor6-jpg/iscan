import mongoose from 'mongoose';

const identityProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },

  // Personal info (from OCR or manual entry)
  firstName:   String,
  middleName:  String,
  lastName:    String,
  birthDate:   Date,
  nationality: String,

  // ── ID submission ──────────────────────────────────────────────────────
  idType:   String,   // e.g. "PhilHealth", "School ID", "Passport", "SSS"
  idNumber: String,

  // primary   = Passport, SSS, UMID, Driver's License, PhilSys
  // secondary = School ID, Postal ID, PhilHealth, Barangay, Company ID
  idCategory: {
    type:    String,
    enum:    ['primary', 'secondary'],
    default: 'secondary',
  },

  idImageUrl:    String,   // uploaded ID photo
  selfieImageUrl: String,  // selfie holding the ID

  faceVerified: {
    type:    Boolean,
    default: false,
  },

  // Overall KYC status for this profile
  kycStatus: {
    type:    String,
    enum:    ['pending', 'under_review', 'verified', 'rejected'],
    default: 'pending',
  },

  // Which tier this submission qualifies for
  // Set by admin or auto-verification
  qualifiesFor: {
    type:    String,
    enum:    ['partial', 'full'],
    default: 'partial',
  },

  rejectionReason: { type: String, default: null },
  diditSessionId: { type: String, default: null },
  reviewedAt:      { type: Date,   default: null },
  reviewedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

}, { timestamps: true });

export default mongoose.model('IdentityProfile', identityProfileSchema);
