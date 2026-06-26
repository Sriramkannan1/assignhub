const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema(
  {
    assignment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    student_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    file_path:     { type: String },
    file_name:     { type: String },
    file_size:     { type: Number },
    notes:         { type: String },
    status:        { type: String, enum: ['submitted', 'late', 'graded', 'pending'], default: 'submitted' },
    score:         { type: Number },
    max_score:     { type: Number },
    feedback:      { type: String },
    graded_by:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    graded_at:     { type: Date },
    submitted_at:  { type: Date, default: Date.now },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Unique constraint: one submission per student per assignment
submissionSchema.index({ assignment_id: 1, student_id: 1 }, { unique: true });

submissionSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Submission', submissionSchema);
