const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    full_name:      { type: String, required: true, trim: true },
    email:          { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash:  { type: String, required: true },
    role:           { type: String, enum: ['student', 'admin'], default: 'student' },
    roll_number:    { type: String, unique: true, sparse: true, trim: true },
    department:     { type: String, trim: true },
    bio:            { type: String },
    avatar_seed:    { type: String },
    avatar_url:     { type: String },
    job_title:      { type: String },
    status:         { type: String, enum: ['pending', 'active', 'inactive', 'suspended'], default: 'pending' },
    email_verified: { type: Boolean, default: false },
    last_active:    { type: Date, default: Date.now },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Virtual: expose _id as id (string) for API compatibility
userSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
