import mongoose from 'mongoose';

const auditSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userEmail: { type: String },
  action:    { type: String, required: true },
  entity:    { type: String },
  entityId:  { type: String },
  details:   { type: mongoose.Schema.Types.Mixed },
  ip:        { type: String },
  status:    { type: String, enum: ['success', 'failed'], default: 'success' }
}, { timestamps: true });

export default mongoose.model('Audit', auditSchema);
