const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true },
    description: { type: String },
    subject:     { type: String, trim: true },
    department:  { type: String, trim: true },
    deadline:    { type: Date, required: true },
    max_score:   { type: Number, default: 100, min: 1 },
    file_path:   { type: String },
    file_name:   { type: String },
    status:      { type: String, enum: ['active', 'upcoming', 'closed'], default: 'active' },
    created_by:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

assignmentSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Assignment', assignmentSchema);
